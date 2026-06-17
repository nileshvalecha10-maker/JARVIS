# J.A.R.V.I.S. - AI Voice Assistant

An interactive voice-controlled AI assistant with a sleek cyberpunk interface. Just Artificial Reasoning Very Intelligent System.

## Features

- 🎤 **Voice Recognition** - Speak commands naturally
- 💬 **Text Input** - Type commands as fallback
- 📝 **Memory System** - Save and recall information
- ⏱️ **Timers & Reminders** - Set timed alerts
- 🔢 **Calculator** - Perform math operations
- 🗣️ **Text-to-Speech** - Hear responses aloud
- 🌙 **Dark Cyberpunk UI** - Sleek cyan and dark theme

## Commands

### Memory
- "Remember my favorite color is teal"
- "What do you know about my favorite color"
- "Forget my favorite color"
- "List memories"
- "Clear everything"

### Time & Date
- "What time is it?"
- "What's today's date?"

### Timers & Reminders
- "Set timer for 5 minutes"
- "Remind me to drink water in 10 minutes"

### Calculator
- "What is 5 + 3 * 2?"
- "Calculate 100 / 4"

## Setup & Development

### Prerequisites
- Node.js 16+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

This creates an optimized build in the `dist/` directory.

### Deployment

The project is automatically deployed to GitHub Pages via GitHub Actions on every push to `main`.

**Live URL:** https://nileshvalecha10-maker.github.io/JARVIS/

## Technologies

- **React 18** - UI library
- **Vite** - Build tool & dev server
- **Tailwind CSS** - Utility-first CSS
- **Lucide React** - Icons
- **Web Speech API** - Voice recognition & synthesis

## Browser Support

Voice recognition works best on:
- Chrome/Edge (most reliable)
- Firefox
- Safari (limited)

Text input works on all modern browsers.

## Architecture

- **Voice Recognition** - Uses `SpeechRecognition` API for real-time voice input
- **Storage** - Local browser storage for memory persistence
- **Commands** - Pattern-matched against regex for instant response
- **UI** - Animated reactor core visual feedback
- **Styling** - Tailwind CSS with custom animations

## Future Enhancements

- Integration with Claude API for reasoning queries
- Custom voice selection
- Export/import memory
- Theme customization
- Conversation history export

## License

MIT
