import os
import logging
import asyncio
from dotenv import load_dotenv, find_dotenv
print("Loaded .env file:", find_dotenv())
from twilio.rest import Client
import uvicorn
from fastapi import FastAPI, Request, Response
from pydantic import BaseModel
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("whatsapp-test")

# Load environment variables
load_dotenv()

# Initialize Twilio client
twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID")
twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
whatsapp_phone_number = os.getenv("WHATSAPP_PHONE_NUMBER")

if not all([twilio_account_sid, twilio_auth_token, whatsapp_phone_number]):
    logger.error("Missing required environment variables. Please check your .env file.")
    exit(1)

client = Client(twilio_account_sid, twilio_auth_token)

# Initialize FastAPI app for webhooks
app = FastAPI(title="WhatsApp Bot Webhook Receiver")

@app.post("/webhook")
async def webhook_receiver(request: Request):
    """
    Receive incoming webhook notifications from Twilio WhatsApp
    """
    # Get the raw data
    form_data = await request.form()
    
    # Log the incoming webhook data
    logger.info("Received webhook data:")
    for key, value in form_data.items():
        logger.info(f"  {key}: {value}")
    
    # Parse WhatsApp message
    if 'Body' in form_data:
        from_number = form_data.get('From', '').replace('whatsapp:', '')
        body = form_data.get('Body', '')
        
        logger.info(f"Received message from {from_number}: {body}")
        
        # Auto-respond to incoming messages
        if body.lower() not in ['stop', 'quit', 'exit']:
            await send_test_message(from_number, f"Echo: {body}")
    
    # Return a 200 OK response to acknowledge receipt
    return Response(status_code=200)

async def send_test_message(to_number: str, message_body: str):
    """
    Send a test message to a WhatsApp number
    
    Args:
        to_number: The recipient's phone number (without whatsapp: prefix)
        message_body: The message to send
    """
    try:
        # Format the number with the WhatsApp prefix
        to_whatsapp = f"whatsapp:{to_number}"
        
        # Send the message
        message = client.messages.create(
            from_=f"whatsapp:{whatsapp_phone_number}",
            body=message_body,
            to=to_whatsapp
        )
        
        logger.info(f"Sent message to {to_number}: {message.sid}")
        return {"status": "success", "message_id": message.sid}
    except Exception as e:
        logger.error(f"Failed to send message: {str(e)}")
        return {"status": "error", "error": str(e)}

async def interactive_mode():
    """
    Run an interactive mode to send and receive messages
    """
    logger.info("=== WhatsApp API Test Tool ===")
    logger.info("1. Press Ctrl+C to exit")
    logger.info("2. Enter recipient's phone number with country code (e.g. +1234567890)")
    logger.info("3. Type your message")
    
    while True:
        try:
            to_number = input("\nRecipient's phone number: ")
            if not to_number:
                continue
                
            message = input("Message to send: ")
            if not message:
                continue
                
            logger.info("Sending message...")
            await send_test_message(to_number, message)
            
        except KeyboardInterrupt:
            logger.info("Exiting interactive mode")
            break
        except Exception as e:
            logger.error(f"Error: {str(e)}")

# Run the FastAPI app for webhooks
def start_webhook_server():
    """Start the webhook server in a separate process"""
    logger.info("Starting webhook server on http://localhost:8000")
    logger.info("Configure your Twilio webhook URL to point to http://YOUR_PUBLIC_URL/webhook")
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    import sys
    import threading
    
    # Start webhook server in a separate thread
    webhook_thread = threading.Thread(target=start_webhook_server, daemon=True)
    webhook_thread.start()
    
    # Start interactive mode
    asyncio.run(interactive_mode()) 