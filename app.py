import asyncio
import logging
from dotenv import load_dotenv
import os

from integrations.whatsapp import WhatsAppIntegration
from services.ai_processor import AIProcessor
from services.command_handler import CommandHandler
from data.database import MessageDatabase
from models.message import Message

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

class LoveBot:
    """Main application class for the WhatsApp couples communication bot"""
    
    def __init__(self):
        """Initialize the bot components"""
        # Load configuration
        self.config = {
            'whatsapp': {
                'account_sid': os.getenv('TWILIO_ACCOUNT_SID'),
                'auth_token': os.getenv('TWILIO_AUTH_TOKEN'),
                'phone_number': os.getenv('WHATSAPP_PHONE_NUMBER')
            },
            'database': {
                'connection_string': os.getenv('MONGODB_CONNECTION_STRING'),
                'database_name': 'lovebot'
            }
        }
        
        # Initialize components
        self.whatsapp = WhatsAppIntegration(self.config['whatsapp'])
        self.ai_processor = AIProcessor()
        self.command_handler = CommandHandler()
        self.database = MessageDatabase(self.config['database'])
    
    async def start(self):
        """Start the bot"""
        logger.info("Starting LoveBot")
        
        # Initialize WhatsApp connection
        await self.whatsapp.initialize()
        
        # Subscribe to incoming messages
        self.whatsapp.subscribe_to_messages(self.handle_message)
        
        # Keep the application running
        while True:
            await asyncio.sleep(60)
    
    async def handle_message(self, message_data):
        """
        Process incoming WhatsApp messages
        
        Args:
            message_data: Raw message data from WhatsApp
        """
        # Convert to our message model
        message = Message(
            sender=message_data['from'],
            group=message_data.get('group_id', ''),
            content=message_data['body'],
            timestamp=datetime.now(),
            message_id=message_data.get('id', '')
        )
        
        # Store message
        await self.database.store_message(message)
        
        # Process as command if applicable
        is_command = await self.command_handler.process_command(message)
        if is_command:
            return
        
        # Get conversation history
        history = await self.database.get_conversation_history(message.group, limit=50)
        
        # Process with AI
        processed = await self.ai_processor.process_message(message, history)
        
        # Determine if bot should respond
        if self.ai_processor.should_respond(processed):
            # Generate and send a response
            # This would involve calling a response generation service
            response = "I noticed there might be some tension. Remember to use 'I' statements."
            await self.whatsapp.send_message(message.group, response)

# Run the bot
if __name__ == "__main__":
    bot = LoveBot()
    asyncio.run(bot.start()) 