from typing import List, Dict, Any, Optional
import motor.motor_asyncio
from models.message import Message

class MessageDatabase:
    """Database interface for message storage and retrieval"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize database connection
        
        Args:
            config: Database configuration
        """
        self.client = motor.motor_asyncio.AsyncIOMotorClient(config['connection_string'])
        self.db = self.client[config['database_name']]
        self.messages = self.db.messages
        
    async def store_message(self, message: Message) -> None:
        """
        Store a message in the database
        
        Args:
            message: The message to store
        """
        await self.messages.insert_one({
            'user_id': message.sender,
            'group_id': message.group,
            'content': message.content,
            'timestamp': message.timestamp,
            # Store only what's necessary based on privacy settings
        })
    
    async def get_conversation_history(self, group_id: str, limit: int = 100) -> List[Message]:
        """
        Retrieve recent conversation history
        
        Args:
            group_id: The WhatsApp group ID
            limit: Maximum number of messages to retrieve
            
        Returns:
            List of message objects
        """
        cursor = self.messages.find({'group_id': group_id}) \
                              .sort('timestamp', -1) \
                              .limit(limit)
        
        messages = []
        async for document in cursor:
            messages.append(Message(
                sender=document['user_id'],
                group=document['group_id'],
                content=document['content'],
                timestamp=document['timestamp']
            ))
        
        return messages
    
    async def get_relevant_messages(self, topics: List[str], group_id: str) -> List[Message]:
        """
        Find messages related to specific topics
        
        Args:
            topics: List of topics to search for
            group_id: The WhatsApp group ID
            
        Returns:
            List of relevant messages
        """
        # Full-text search for related messages
        query = {
            'group_id': group_id,
            '$text': {'$search': ' '.join(topics)}
        }
        
        cursor = self.messages.find(query)
        
        messages = []
        async for document in cursor:
            messages.append(Message(
                sender=document['user_id'],
                group=document['group_id'],
                content=document['content'],
                timestamp=document['timestamp']
            ))
        
        return messages 