// server.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
// --- NEW: Import Firebase Admin SDK ---
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- NEW: Initialize Firebase Admin ---
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
// ------------------------------------

// REMOVED: The hardcoded sampleQuiz variable is no longer needed.

const games = {};
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('✅ A user connected:', socket.id);

    // --- MODIFIED: Host creates a game ---

    socket.on('host:create_quiz', async (quizData) => {
    try {
        const docRef = await db.collection('quizzes').add(quizData);
        console.log(`Quiz "${quizData.title}" saved with ID: ${docRef.id}`);
        // Confirm to the host that the quiz was saved
        socket.emit('quiz_saved', { title: quizData.title });
    } catch (error) {
        console.error("Error saving quiz:", error);
        socket.emit('error', { message: 'Failed to save quiz.' });
    }
    });

    // NEW: Listen for a host requesting their list of quizzes
    socket.on('host:get_quizzes', async () => {
        try {
            const quizzesSnapshot = await db.collection('quizzes').get();
            const quizzes = quizzesSnapshot.docs.map(doc => ({
                id: doc.id,
                title: doc.data().title
            }));
            socket.emit('quizzes_list', quizzes);
        } catch (error) {
            console.error("Error fetching quizzes:", error);
        }
    });

    // MODIFIED: This now accepts a quizId from the host
    socket.on('host:create_game', async ({ quizId }) => {
        try {
            const quizDoc = await db.collection('quizzes').doc(quizId).get();
            if (!quizDoc.exists) {
                socket.emit('error', { message: 'Selected quiz not found.' });
                return;
            }
            const quizData = quizDoc.data();

            const gameCode = Math.floor(100000 + Math.random() * 900000).toString();
            socket.join(gameCode);

            games[gameCode] = {
                host: socket.id,
                players: [],
                quiz: quizData.questions,
                currentQuestionIndex: 0,
                answeredPlayers: new Set()
            };

            // This now sends back the gameCode AND the quizId
            socket.emit('game_created', { gameCode, quizId });
            console.log(`Host ${socket.id} created game ${gameCode} with quiz "${quizData.title}"`);
        } catch (error) {
            console.error("Error creating game:", error);
            socket.emit('error', { message: 'Could not create game.' });
        }
    });

    // ... (the rest of your socket event handlers remain the same) ...
    socket.on('player:join_game', (data) => {
        const { gameCode, playerName } = data;
        if (games[gameCode]) {
            socket.join(gameCode);
            const newPlayer = { id: socket.id, name: playerName, score: 0 };
            games[gameCode].players.push(newPlayer);
            console.log(`Player ${playerName} (${socket.id}) joined game ${gameCode}`);
            io.to(gameCode).emit('player_joined', { players: games[gameCode].players });
        } else {
            socket.emit('error', { message: 'Game not found.' });
        }
    });

    socket.on('host:start_game', (data) => {
        const { gameCode } = data;
        if (games[gameCode] && games[gameCode].host === socket.id) {
            console.log(`Game ${gameCode} has started.`);
            const firstQuestion = games[gameCode].quiz[0];
            io.to(gameCode).emit('question_started', {
                question: firstQuestion.question,
                options: firstQuestion.options
            });
        }
    });
    
    socket.on('player:submit_answer', (data) => {
        const { gameCode, answer } = data;
        const game = games[gameCode];
        if (!game || game.answeredPlayers.has(socket.id)) { return; }
        game.answeredPlayers.add(socket.id);
        const currentQuestion = game.quiz[game.currentQuestionIndex];
        const player = game.players.find(p => p.id === socket.id);
        if (currentQuestion.correctAnswer === answer) { player.score += 1000; }
        if (game.answeredPlayers.size === game.players.length) {
            io.to(gameCode).emit('show_results', {
                correctAnswer: currentQuestion.correctAnswer,
                players: game.players.sort((a, b) => b.score - a.score)
            });
        }
    });

    socket.on('host:next_question', (data) => {
        const { gameCode } = data;
        const game = games[gameCode];
        if (game && game.host === socket.id) {
            game.currentQuestionIndex++;
            game.answeredPlayers.clear();
            if (game.currentQuestionIndex < game.quiz.length) {
                const nextQuestion = game.quiz[game.currentQuestionIndex];
                io.to(gameCode).emit('question_started', {
                    question: nextQuestion.question,
                    options: nextQuestion.options
                });
            } else {
                io.to(gameCode).emit('game_over', {
                    players: game.players.sort((a, b) => b.score - a.score)
                });
            }
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ A user disconnected:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});