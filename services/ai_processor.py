from typing import Dict, List, Any, Optional
from .nlp_service import NLPService
from .sentiment_analyzer import SentimentAnalyzer
from .context_manager import ContextManager
from models.message import Message, ProcessedMessage

class AIProcessor:
    """Processes messages using AI capabilities"""
    
    def __init__(self):
        """Initialize AI processing components"""
        self.nlp_service = NLPService()
        self.sentiment_analyzer = SentimentAnalyzer()
        self.context_manager = ContextManager()
    
    async def process_message(self, message: Message, conversation_history: List[Message]) -> ProcessedMessage:
        """
        Process a message using NLP, sentiment analysis, and context
        
        Args:
            message: The message to process
            conversation_history: Recent conversation history
            
        Returns:
            ProcessedMessage with analysis results
        """
        # Extract entities, intent and key topics
        nlp_result = await self.nlp_service.analyze(message.content)
        
        # Analyze sentiment
        sentiment = await self.sentiment_analyzer.analyze(message.content)
        
        # Update context with new information
        self.context_manager.update_context(message, nlp_result, sentiment)
        
        # Retrieve relevant context from past conversations
        relevant_context = self.context_manager.get_relevant_context(nlp_result)
        
        return ProcessedMessage(
            original_message=message,
            nlp_result=nlp_result,
            sentiment=sentiment,
            relevant_context=relevant_context
        )
    
    def should_respond(self, processed_message: ProcessedMessage) -> bool:
        """
        Determine if the bot should respond to this message
        
        Args:
            processed_message: The processed message with analysis
            
        Returns:
            True if the bot should respond, False otherwise
        """
        return self._determine_response_need(processed_message)
    
    def _determine_response_need(self, processed_message: ProcessedMessage) -> bool:
        """
        Implementation of response determination logic
        
        Args:
            processed_message: The processed message with analysis
            
        Returns:
            True if intervention is needed, False otherwise
        """
        # E.g., negativity above threshold, communication breakdown detected
        return processed_message.sentiment.score < -0.7 