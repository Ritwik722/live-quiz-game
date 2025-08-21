const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const admin = require('firebase-admin');

// --- SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- FIREBASE INITIALIZATION ---
let serviceAccount;
// Check if we are in a production environment (like Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // If so, parse the credentials from the environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // Otherwise, use the local file for development
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// --- STATE MANAGEMENT ---
// This object will hold the live game data in memory
const games = {};
app.use(express.static('public'));

// --- HELPER FUNCTION FOR TIMERS ---
function startQuestionTimer(gameCode) {
    const game = games[gameCode];
    if (!game) return;
    
    game.questionStartTime = Date.now(); // <-- ADD THIS LINE
    let timeLeft = 20;

    if (game.timer) clearInterval(game.timer);

    game.timer = setInterval(() => {
        // ... (the rest of the function remains the same)
    }, 1000);
}


// --- SOCKET.IO CONNECTION LOGIC ---
io.on('connection', (socket) => {
    console.log(`✅ User Connected: ${socket.id}`);

    // === HOST EVENTS ===
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
    
    socket.on('host:create_quiz', async (quizData) => {
        try {
            const docRef = await db.collection('quizzes').add(quizData);
            console.log(`Quiz "${quizData.title}" saved with ID: ${docRef.id}`);
            socket.emit('quiz_saved', { title: quizData.title });
        } catch (error) {
            console.error("Error saving quiz:", error);
            socket.emit('error', { message: 'Failed to save quiz.' });
        }
    });

    socket.on('host:create_game', async ({ quizId }) => {
        try {
            const quizDoc = await db.collection('quizzes').doc(quizId).get();
            if (!quizDoc.exists) return socket.emit('error', { message: 'Selected quiz not found.' });
            
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

            socket.emit('game_created', { gameCode });
            console.log(`Host ${socket.id} created game ${gameCode}`);
        } catch (error) {
            console.error("Error creating game:", error);
            socket.emit('error', { message: 'Could not create game.' });
        }
    });

    socket.on('host:start_game', (data) => {
        const { gameCode } = data;
        const game = games[gameCode];
        if (game && game.host === socket.id) {
            const firstQuestion = game.quiz[0];
            io.to(gameCode).emit('question_started', {
                question: firstQuestion.question,
                options: firstQuestion.options
            });
            startQuestionTimer(gameCode);
        }
    });

    socket.on('host:next_question', (data) => {
        const { gameCode } = data;
        const game = games[gameCode];
        if (game && game.host === socket.id) {
            clearInterval(game.timer);
            game.currentQuestionIndex++;
            game.answeredPlayers.clear();

            if (game.currentQuestionIndex < game.quiz.length) {
                const nextQuestion = game.quiz[game.currentQuestionIndex];
                io.to(gameCode).emit('question_started', {
                    question: nextQuestion.question,
                    options: nextQuestion.options
                });
                startQuestionTimer(gameCode);
            } else {
                io.to(gameCode).emit('game_over', {
                    players: game.players.sort((a, b) => b.score - a.score)
                });
            }
        }
    });

    // === PLAYER EVENTS ===
   socket.on('host:rejoin', (data) => {
        const { gameCode } = data;
        const game = games[gameCode];
        if (game) {
            // Update the host's socket ID to their new connection ID.
            game.host = socket.id;
            socket.join(gameCode);
            console.log(`Host ${socket.id} re-joined and claimed game ${gameCode}`);
            // Immediately send the current player list to the host.
            socket.emit('player_joined', { players: game.players });
        }
    });

    // SIMPLIFIED PLAYER JOIN LOGIC
    socket.on('player:join_game', (data) => {
        const { gameCode, playerName } = data;
        const game = games[gameCode];
        if (game) {
            socket.join(gameCode);
            const newPlayer = { id: socket.id, name: playerName, score: 0 };
            game.players.push(newPlayer);
            console.log(`Player ${playerName} joined game ${gameCode}`);
            // Broadcast the new player list to EVERYONE in the room. This is simple and effective.
            io.to(gameCode).emit('player_joined', { players: game.players });
        } else {
            socket.emit('error', { message: 'Game not found.' });
        }
    });


socket.on('player:submit_answer', (data) => {
    const { gameCode, answer } = data;
    const game = games[gameCode];
    if (!game || game.answeredPlayers.has(socket.id)) return;

    const currentQuestion = game.quiz[game.currentQuestionIndex];
    if (!currentQuestion) return;

    game.answeredPlayers.add(socket.id);
    const player = game.players.find(p => p.id === socket.id);

    // New, reliable scoring logic
    if (currentQuestion.correctAnswer === answer) {
        const timeTaken = (Date.now() - game.questionStartTime) / 1000; // Time in seconds
        const timeBonus = Math.max(0, 20 - timeTaken); // Points for time left
        player.score += 500 + Math.round(500 * (timeBonus / 20));
    }

    if (game.answeredPlayers.size === game.players.length) {
        clearInterval(game.timer);
        io.to(gameCode).emit('show_results', {
            correctAnswer: currentQuestion.correctAnswer,
            players: game.players.sort((a, b) => b.score - a.score)
        });
    }
});
    socket.on('disconnect', () => {
        console.log(`❌ User Disconnected: ${socket.id}`);
        // Add logic here to find which game the user was in and remove them.
    });
});

// --- START SERVER ---
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});