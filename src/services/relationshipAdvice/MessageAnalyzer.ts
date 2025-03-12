import { WAMessage } from '@whiskeysockets/baileys';
import pino from 'pino';

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:standard',
    }
  }
});

// Define supported languages
type SupportedLanguage = 'en' | 'es' | 'he' | 'th';

// Define keyword dictionaries for different languages
interface LanguageKeywords {
  relationshipKeywords: string[];
  emotionalKeywords: string[];
  questionPatterns: RegExp[];
  directRequestPatterns: RegExp[];
}

/**
 * Analyzes messages to determine if they need AI processing for relationship advice
 */
export class MessageAnalyzer {
  // Multi-language keyword dictionaries
  private languageKeywords: Record<SupportedLanguage, LanguageKeywords> = {
    // English keywords
    en: {
      // Keywords that might indicate relationship issues or advice needs
      relationshipKeywords: [
        'relationship', 'partner', 'boyfriend', 'girlfriend', 'husband', 'wife', 
        'spouse', 'marriage', 'dating', 'love', 'breakup', 'divorce', 'argument',
        'fight', 'conflict', 'trust', 'cheating', 'jealous', 'communication',
        'anniversary', 'romantic', 'date', 'commitment', 'engaged', 'wedding',
        'affair', 'ex', 'toxic', 'healthy relationship', 'boundaries', 'respect'
      ],

      // Emotional keywords that might indicate a need for intervention
      emotionalKeywords: [
        'angry', 'upset', 'sad', 'depressed', 'anxious', 'worried', 'frustrated',
        'annoyed', 'hurt', 'disappointed', 'confused', 'lonely', 'heartbroken',
        'betrayed', 'insecure', 'afraid', 'stressed', 'overwhelmed', 'exhausted',
        'happy', 'excited', 'grateful', 'in love', 'miss', 'missing'
      ],

      // Question patterns that might indicate seeking advice
      questionPatterns: [
        /\b(?:how|what|why|when|should|could|would|is|are|do|does|can|will)\b.*\?/i,
        /\badvice\b/i,
        /\bhelp\b.*\bwith\b/i,
        /\bthoughts\b.*\?/i,
        /\bopinion\b.*\?/i,
        /\bsuggestion\b/i,
      ],

      // Direct request patterns
      directRequestPatterns: [
        /\badvise\b/i,
        /\bhelp\b.*\brelationship\b/i,
        /\brelationship\b.*\badvice\b/i,
        /\bwhat\b.*\bshould\b.*\bdo\b/i,
        /\bhow\b.*\bfix\b/i,
        /\bhow\b.*\bimprove\b/i,
        /\bhow\b.*\bsave\b/i,
      ]
    },
    
    // Spanish keywords
    es: {
      relationshipKeywords: [
        'relación', 'pareja', 'novio', 'novia', 'esposo', 'esposa', 
        'cónyuge', 'matrimonio', 'citas', 'amor', 'ruptura', 'divorcio', 'discusión',
        'pelea', 'conflicto', 'confianza', 'engaño', 'celos', 'comunicación',
        'aniversario', 'romántico', 'cita', 'compromiso', 'comprometido', 'boda',
        'aventura', 'ex', 'tóxico', 'relación saludable', 'límites', 'respeto'
      ],

      emotionalKeywords: [
        'enojado', 'molesto', 'triste', 'deprimido', 'ansioso', 'preocupado', 'frustrado',
        'irritado', 'herido', 'decepcionado', 'confundido', 'solitario', 'desconsolado',
        'traicionado', 'inseguro', 'asustado', 'estresado', 'abrumado', 'agotado',
        'feliz', 'emocionado', 'agradecido', 'enamorado', 'extraño', 'extrañando'
      ],

      questionPatterns: [
        /\b(?:cómo|qué|por qué|cuándo|debería|podría|sería|es|son|hago|hace|puedo|será)\b.*\?/i,
        /\bconsejo\b/i,
        /\bayuda\b.*\bcon\b/i,
        /\bpensamientos\b.*\?/i,
        /\bopinión\b.*\?/i,
        /\bsugerencia\b/i,
      ],

      directRequestPatterns: [
        /\baconsejar\b/i,
        /\bayuda\b.*\brelación\b/i,
        /\brelación\b.*\bconsejo\b/i,
        /\bqué\b.*\bdebería\b.*\bhacer\b/i,
        /\bcómo\b.*\barreglar\b/i,
        /\bcómo\b.*\bmejorar\b/i,
        /\bcómo\b.*\bsalvar\b/i,
      ]
    },
    
    // Hebrew keywords
    he: {
      relationshipKeywords: [
        'יחסים', 'בן זוג', 'חבר', 'חברה', 'בעל', 'אישה', 
        'בן/בת זוג', 'נישואים', 'דייטים', 'אהבה', 'פרידה', 'גירושים', 'ויכוח',
        'מריבה', 'קונפליקט', 'אמון', 'בגידה', 'קנאה', 'תקשורת',
        'יום נישואים', 'רומנטי', 'דייט', 'מחויבות', 'מאורס', 'חתונה',
        'רומן', 'אקס', 'רעיל', 'יחסים בריאים', 'גבולות', 'כבוד'
      ],

      emotionalKeywords: [
        'כועס', 'מוטרד', 'עצוב', 'מדוכא', 'חרד', 'מודאג', 'מתוסכל',
        'מרוגז', 'פגוע', 'מאוכזב', 'מבולבל', 'בודד', 'שבור לב',
        'בגוד', 'חסר ביטחון', 'מפחד', 'לחוץ', 'מוצף', 'מותש',
        'שמח', 'נרגש', 'אסיר תודה', 'מאוהב', 'מתגעגע', 'געגועים'
      ],

      questionPatterns: [
        /\b(?:איך|מה|למה|מתי|האם|יכול|אפשר|צריך)\b.*\?/i,
        /\bעצה\b/i,
        /\bעזרה\b.*\bעם\b/i,
        /\bמחשבות\b.*\?/i,
        /\bדעה\b.*\?/i,
        /\bהצעה\b/i,
      ],

      directRequestPatterns: [
        /\bלייעץ\b/i,
        /\bעזרה\b.*\bיחסים\b/i,
        /\bיחסים\b.*\bעצה\b/i,
        /\bמה\b.*\bלעשות\b/i,
        /\bאיך\b.*\bלתקן\b/i,
        /\bאיך\b.*\bלשפר\b/i,
        /\bאיך\b.*\bלהציל\b/i,
      ]
    },
    
    // Thai keywords
    th: {
      relationshipKeywords: [
        'ความสัมพันธ์', 'คู่รัก', 'แฟน', 'แฟนสาว', 'สามี', 'ภรรยา', 
        'คู่สมรส', 'การแต่งงาน', 'เดท', 'ความรัก', 'เลิกกัน', 'หย่า', 'ทะเลาะ',
        'ต่อสู้', 'ความขัดแย้ง', 'ความไว้วางใจ', 'นอกใจ', 'หึง', 'การสื่อสาร',
        'วันครบรอบ', 'โรแมนติก', 'นัด', 'ความผูกพัน', 'หมั้น', 'งานแต่งงาน',
        'ชู้', 'แฟนเก่า', 'เป็นพิษ', 'ความสัมพันธ์ที่ดี', 'ขอบเขต', 'ความเคารพ'
      ],

      emotionalKeywords: [
        'โกรธ', 'ไม่พอใจ', 'เศร้า', 'ซึมเศร้า', 'วิตกกังวล', 'กังวล', 'หงุดหงิด',
        'รำคาญ', 'เจ็บปวด', 'ผิดหวัง', 'สับสน', 'เหงา', 'อกหัก',
        'ถูกทรยศ', 'ไม่มั่นใจ', 'กลัว', 'เครียด', 'ท่วมท้น', 'เหนื่อย',
        'มีความสุข', 'ตื่นเต้น', 'ขอบคุณ', 'หลงรัก', 'คิดถึง', 'คิดถึง'
      ],

      questionPatterns: [
        /\b(?:อย่างไร|อะไร|ทำไม|เมื่อไหร่|ควร|สามารถ|จะ|เป็น|ทำ|ได้)\b.*\?/i,
        /\bคำแนะนำ\b/i,
        /\bช่วย\b.*\bกับ\b/i,
        /\bความคิด\b.*\?/i,
        /\bความเห็น\b.*\?/i,
        /\bข้อเสนอแนะ\b/i,
      ],

      directRequestPatterns: [
        /\bแนะนำ\b/i,
        /\bช่วย\b.*\bความสัมพันธ์\b/i,
        /\bความสัมพันธ์\b.*\bคำแนะนำ\b/i,
        /\bอะไร\b.*\bควร\b.*\bทำ\b/i,
        /\bอย่างไร\b.*\bแก้ไข\b/i,
        /\bอย่างไร\b.*\bปรับปรุง\b/i,
        /\bอย่างไร\b.*\bช่วย\b/i,
      ]
    }
  };

  // Symbol for direct requests (instead of "LoveBot")
  private directRequestSymbol: string = '&';

  /**
   * Analyzes a message to determine if it needs AI processing for relationship advice
   * @param message The WhatsApp message to analyze
   * @returns An object with the analysis result and reason
   */
  public analyzeMessage(message: WAMessage): { needsProcessing: boolean; reason: string; score: number } {
    try {
      // Extract text content from the message
      const textContent = this.extractTextContent(message);
      
      if (!textContent) {
        return { needsProcessing: false, reason: 'No text content', score: 0 };
      }

      // Check if this is a private chat (1:1 conversation)
      const isPrivateChat = this.isPrivateChat(message.key.remoteJid);
      
      // In private chats, treat all messages as direct requests
      if (isPrivateChat) {
        return { 
          needsProcessing: true, 
          reason: 'Direct message in private chat', 
          score: 3.0 // High score for private chat messages
        };
      }

      // For group chats, continue with normal processing
      
      // Check for direct request using the symbol
      if (textContent.trim().startsWith(this.directRequestSymbol)) {
        return { 
          needsProcessing: true, 
          reason: 'Direct request using symbol', 
          score: 3.0 // High score for direct symbol requests
        };
      }

      // Check for direct requests to the bot by name
      if (this.isDirectRequest(textContent, message)) {
        return { 
          needsProcessing: true, 
          reason: 'Direct request to the bot', 
          score: 2.0 
        };
      }

      // Calculate relevance score across all supported languages
      const { score, language } = this.calculateMultiLanguageRelevanceScore(textContent);
      
      // Determine if the message needs processing based on the score
      if (score >= 1) {
        return { 
          needsProcessing: true, 
          reason: `Relevance score ${score} meets threshold (detected language: ${language})`, 
          score 
        };
      }

      return { needsProcessing: false, reason: 'Below relevance threshold', score };
    } catch (error) {
      logger.error('Error analyzing message:', error);
      return { needsProcessing: false, reason: 'Error during analysis', score: 0 };
    }
  }

  /**
   * Determines if a chat is a private chat (1:1) or a group chat
   * @param remoteJid The JID of the chat
   * @returns Whether the chat is a private chat
   */
  private isPrivateChat(remoteJid: string | null | undefined): boolean {
    if (!remoteJid) return false;
    
    // Group chats in WhatsApp typically end with @g.us
    // Private chats typically end with @s.whatsapp.net
    return remoteJid.endsWith('@s.whatsapp.net');
  }

  /**
   * Determines if the message is a direct request to the bot
   * @param text The message text
   * @param message The WhatsApp message
   * @returns Whether the message is a direct request
   */
  private isDirectRequest(text: string, message: WAMessage): boolean {
    const lowerText = text.toLowerCase();
    
    // Check if the message mentions the bot by name
    if (lowerText.includes('lovebot') || lowerText.includes('love bot')) {
      return true;
    }
    
    // Check if the message is a reply to the bot
    if (message.message?.extendedTextMessage?.contextInfo?.participant) {
      const repliedToJid = message.message.extendedTextMessage.contextInfo.participant;
      // Check if the replied-to message is from the bot (would need to compare with bot's JID)
      // This would require passing the bot's JID to this method
      // For now, we'll just check if it's a reply and contains certain keywords
      
      const keywords = ['advice', 'help', 'relationship', 'consejo', 'ayuda', 'relación', 'עצה', 'עזרה', 'יחסים', 'คำแนะนำ', 'ช่วย', 'ความสัมพันธ์'];
      for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Calculates a relevance score for the message across multiple languages
   * @param text The message text
   * @returns The highest relevance score and detected language
   */
  private calculateMultiLanguageRelevanceScore(text: string): { score: number; language: string } {
    let highestScore = 0;
    let detectedLanguage = 'en'; // Default to English
    
    // Calculate score for each supported language
    for (const [language, keywords] of Object.entries(this.languageKeywords)) {
      const score = this.calculateLanguageRelevanceScore(text, language as SupportedLanguage);
      
      if (score > highestScore) {
        highestScore = score;
        detectedLanguage = language;
      }
    }
    
    return { score: highestScore, language: detectedLanguage };
  }

  /**
   * Calculates a relevance score for the message in a specific language
   * @param text The message text
   * @param language The language to check
   * @returns A relevance score
   */
  private calculateLanguageRelevanceScore(text: string, language: SupportedLanguage): number {
    let score = 0;
    const lowerText = text.toLowerCase();
    const keywords = this.languageKeywords[language];

    // Check for relationship keywords
    for (const keyword of keywords.relationshipKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score += 1.0;
        logger.debug(`Relationship keyword found (${language}): ${keyword}`);
      }
    }

    // Check for emotional keywords
    for (const keyword of keywords.emotionalKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score += 0.3;
        logger.debug(`Emotional keyword found (${language}): ${keyword}`);
      }
    }

    // Check for question patterns
    for (const pattern of keywords.questionPatterns) {
      if (pattern.test(lowerText)) {
        score += 0.7;
        logger.debug(`Question pattern matched (${language}): ${pattern}`);
        break; // Only count one question pattern match
      }
    }

    // Check for direct request patterns
    for (const pattern of keywords.directRequestPatterns) {
      if (pattern.test(lowerText)) {
        score += 1.0;
        logger.debug(`Direct request pattern matched (${language}): ${pattern}`);
        break; // Only count one direct request pattern match
      }
    }

    // Additional score for longer messages (might indicate more complex issues)
    if (text.length > 100) {
      score += 0.2;
    }

    return score;
  }

  /**
   * Extracts text content from a WhatsApp message
   * @param message The WhatsApp message
   * @returns The extracted text content
   */
  private extractTextContent(message: WAMessage): string {
    let textContent = '';
    
    if (message.message?.conversation) {
      textContent = message.message.conversation;
    } else if (message.message?.extendedTextMessage?.text) {
      textContent = message.message.extendedTextMessage.text;
    } else if (message.message?.imageMessage?.caption) {
      textContent = message.message.imageMessage.caption;
    } else if (message.message?.videoMessage?.caption) {
      textContent = message.message.videoMessage.caption;
    } else if (message.message?.documentMessage?.caption) {
      textContent = message.message.documentMessage.caption;
    } else if (message.message?.buttonsResponseMessage?.selectedButtonId) {
      textContent = message.message.buttonsResponseMessage.selectedButtonId;
    } else if (message.message?.listResponseMessage?.title) {
      textContent = message.message.listResponseMessage.title;
    }
    
    return textContent;
  }
} 