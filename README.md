# 🚀 Live Multiplayer Quiz Game

A real-time, interactive quiz game inspired by Kahoot. This application allows a host to create and launch custom quizzes, while players can join a live game room from any device using a unique code to compete for the highest score.

**Live Demo:** [Click here ](https://live-quiz-game.onrender.com)

## ✨ Features

- **Real-Time Gameplay:** Questions, timers, and leaderboards are synchronized across all devices using WebSockets.
- **Host Dashboard:** A dedicated interface for hosts to create, view, and manage their own quizzes.
- **Dynamic Game Rooms:** Hosts can launch a quiz to generate a unique, shareable game code for players to join.
- **Live Leaderboards:** Scores are calculated based on correctness and speed, with an updated leaderboard shown after each question.
- **Cloud Database Integration:** All quiz data is stored and retrieved from Google Firestore, a scalable NoSQL database.
- **Polished UI:** Includes visual feedback for correct/incorrect answers and a clean, responsive design.

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js
- **Real-Time Communication:** Socket.IO
- **Database:** Google Firestore (Firebase Admin SDK)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Deployment:** Render

## ⚙️ Running the Project Locally

To run this project on your own machine, follow these steps:

### Prerequisites
- Node.js installed
- A Google Firebase project with Firestore enabled
