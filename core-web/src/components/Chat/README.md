# Chat Component

## Overview

The chat interface provides a real-time streaming conversation experience with an AI assistant.

## Streaming Behavior

1. **User sends message** → User message appears immediately, scrolls to top of viewport
2. **Waiting for response** → Black pulsing dot appears below user message
3. **Streaming response** → Text streams in as it arrives from the API with markdown rendering
4. **Complete** → Final message replaces streaming content

## Key Features

- **Real-time streaming**: Text appears as the API sends it
- **Markdown rendering**: Full markdown support (code blocks, lists, tables, etc.)
- **Scroll management**: User messages scroll to top, scroll-to-bottom button when scrolled up
- **Conversation persistence**: Messages stored and loaded from API
- **New chat handling**: Clean state reset when starting new conversation

## Components

- `ChatView.tsx` - Main chat container with streaming logic and scroll management
- `ChatMessage.tsx` - Individual message rendering with markdown support
- `ChatInput.tsx` - Text input with auto-resize and keyboard handling

## Future Enhancements

For more advanced streaming animations (character-by-character fade, rate limiting), consider:
- [FlowToken](https://github.com/Ephibbs/flowtoken) - React library for animated LLM streaming
- Custom queue-based system with opacity animations per character
