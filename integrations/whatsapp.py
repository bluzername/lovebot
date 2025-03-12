import logging
from typing import Callable, Dict, Any
import requests
from twilio.rest import Client

class WhatsAppIntegration:
    """Integration with WhatsApp Business API"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize WhatsApp integration
        
        Args:
            config: Configuration dictionary with API credentials
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.client = Client(config['account_sid'], config['auth_token'])
        self.webhook_handlers = {}
        
    async def initialize(self) -> None:
        """Connect to WhatsApp Business API"""
        self.logger.info("Initializing WhatsApp Business API connection")
        # Setup webhook endpoints, verify connection, etc.
        # Specific implementation depends on which WhatsApp API service you use
    
    async def send_message(self, recipient: str, message: str) -> Dict[str, Any]:
        """
        Send a message to a WhatsApp user or group
        
        Args:
            recipient: The recipient's phone number or group ID
            message: The message content
            
        Returns:
            Response data from the API
        """
        try:
            message = self.client.messages.create(
                from_=f"whatsapp:{self.config['phone_number']}",
                body=message,
                to=f"whatsapp:{recipient}"
            )
            self.logger.debug(f"Sent message to {recipient}: {message.sid}")
            return {"status": "success", "message_id": message.sid}
        except Exception as e:
            self.logger.error(f"Failed to send message: {str(e)}")
            return {"status": "error", "error": str(e)}
    
    async def send_private_message(self, user_id: str, message: str) -> Dict[str, Any]:
        """
        Send a direct private message to an individual
        
        Args:
            user_id: The user's phone number
            message: The message content
            
        Returns:
            Response data from the API
        """
        return await self.send_message(user_id, message)
    
    def subscribe_to_messages(self, callback: Callable) -> None:
        """
        Register a callback function for incoming messages
        
        Args:
            callback: Function to call when a message is received
        """
        self.webhook_handlers['message'] = callback
    
    def process_webhook(self, data: Dict[str, Any]) -> None:
        """
        Process incoming webhook data from WhatsApp
        
        Args:
            data: The webhook payload
        """
        if 'message' in self.webhook_handlers and 'message' in data:
            self.webhook_handlers['message'](data['message']) 