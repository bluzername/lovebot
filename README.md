# LoveBot - Relationship Advice WhatsApp Bot

LoveBot is a WhatsApp bot that provides relationship advice using AI. It can analyze messages in multiple languages (English, Spanish, Hebrew, and Thai) and respond with helpful advice when relationship topics are detected.

## Features

- **Multi-language Support**: Understands and responds in English, Spanish, Hebrew, and Thai
- **Smart Detection**: Identifies relationship-related messages in group and private chats
- **Direct Request Symbol**: Use "&" at the start of a message for direct advice in group chats
- **Welcome Messages**: Automatically sends welcome messages when added to new chats
- **Local Testing Mode**: Test the bot without connecting to WhatsApp

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/lovebot.git
   cd lovebot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4o-mini
   LOG_LEVEL=info
   ```

### Running the Bot

#### Online Mode (WhatsApp Connection)

```
npm start
```

#### Local Testing Mode (No WhatsApp Connection)

```
npm run start:local
```

## Usage

### In Private Chats
- Simply send any message directly to the bot - all messages are processed

### In Group Chats
1. Start your message with "&" (e.g., "& I'm having trouble with my partner")
2. Mention "LoveBot" in your message
3. Simply discuss relationship topics (the bot will respond if relevant)

## Commands

- `/help` - Show available commands
- `/status` - Check connection status
- `/testadvice [message]` - Test relationship advice with a message

## Development

### Building the Project

```
npm run build
```

### Running Tests

```
npm test
```

## License

[MIT License](LICENSE) 