from dataclasses import dataclass
from typing import Dict, List, Any, Optional
from datetime import datetime

@dataclass
class Message:
    """Represents a WhatsApp message"""
    sender: str
    group: str
    content: str
    timestamp: datetime
    message_id: Optional[str] = None

@dataclass
class NLPResult:
    """Results from NLP analysis"""
    entities: List[Dict[str, Any]]
    intent: str
    topics: List[str]
    tokens: List[str]

@dataclass
class SentimentResult:
    """Results from sentiment analysis"""
    score: float  # -1.0 to 1.0
    magnitude: float
    is_positive: bool
    is_negative: bool
    is_neutral: bool

@dataclass
class ProcessedMessage:
    """A message with processing results"""
    original_message: Message
    nlp_result: NLPResult
    sentiment: SentimentResult
    relevant_context: List[Message] 