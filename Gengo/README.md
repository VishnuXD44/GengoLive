# WebRTC Language Match Application

This project is a WebRTC-based web application that connects users based on their chosen language and role (practice or coach). Users selecting the same language from both options will be matched and connected for video chat sessions.

## Features

- User-friendly interface for selecting language and role
- Real-time video chat functionality using WebRTC
- Matching system based on user preferences
- Responsive design for comfortable user experience

## Project Structure

```
webrtc-language-app
├── public
│   ├── index.html        # Main HTML document
│   ├── styles.css       # CSS styles for the application
│   └── scripts
│       └── main.js      # Client-side JavaScript logic
├── src
│   ├── server.js        # Node.js server setup
│   ├── signaling
│   │   └── index.js     # Signaling server logic
│   └── utils
│       └── webrtc.js    # WebRTC utility functions
├── package.json          # npm configuration file
├── .gitignore            # Git ignore file
└── README.md             # Project documentation
```

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/webrtc-language-app.git
   ```
2. Navigate to the project directory:
   ```
   cd webrtc-language-app
   ```
3. Install the dependencies:
   ```
   npm install
   ```

## Usage

1. Start the server:
   ```
   node src/server.js
   ```
2. Open your web browser and navigate to `http://localhost:3000` to access the application.
3. Select your preferred language and role (practice or coach) to find a match.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.