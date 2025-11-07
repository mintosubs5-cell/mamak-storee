const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('index.html');  // Tambahkan ini untuk path absolut

const app = express();
const PORT = 8000;
const JWT_SECRET = 'rskcLhzk8DgcuRKxwIEwMgFBerJpLd9wmtyIGpAKBvG'; // In production, use environment variable

// Embed data awal untuk reviews (bukan baca dari file)
let reviews = [
    // Contoh data awal; tambahkan sesuai kebutuhan
    // { gameId: 1, user: 'user1', rating: 4.5, comment: 'Great game!', date: '2023-01-01T00:00:00.000Z', avatar: 'default-avatar.png' }
];

// Embed data awal untuk userData (bukan baca dari file)
let userData = {
    // Contoh user; tambahkan sesuai kebutuhan
    // 1: { id: 1, username: 'admin', email: 'admin@example.com', password: 'hashedpassword', verified: true, avatar: 'default-avatar.png', balance: 0, wishlist: [], library: [], cart: [] }
};

// Coba baca file jika ada (untuk local dev), tapi fallback ke data embedded
try {
    const reviewsPath = path.join(__dirname, 'reviews.json');
    if (fs.existsSync(reviewsPath)) {
        const data = fs.readFileSync(reviewsPath, 'utf8').replace(/^\uFEFF/, '');
        reviews = JSON.parse(data);
    }
} catch (err) {
    console.error('Error loading reviews:', err);
}

try {
    const userDataPath = path.join(__dirname, 'userData.json');
    if (fs.existsSync(userDataPath)) {
        const data = fs.readFileSync(userDataPath, 'utf8').replace(/^\uFEFF/, '');
        userData = JSON.parse(data);
    }
} catch (err) {
    console.error('Error loading userData:', err);
}

// Function to save reviews to file (opsional, tapi tidak persistent di Vercel)
function saveReviews() {
    try {
        fs.writeFileSync(path.join(__dirname, 'reviews.json'), JSON.stringify(reviews, null, 2));
    } catch (err) {
        console.error('Error saving reviews:', err);
    }
}

// Function to save userData to file (opsional, tapi tidak persistent di Vercel)
function saveUserData() {
    try {
        fs.writeFileSync(path.join(__dirname, 'userData.json'), JSON.stringify(userData, null, 2));
    } catch (err) {
        console.error('Error saving userData:', err);
    }
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));  // Serve file statis dari public/

// Serve the HTML file (dari public/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Array games tetap sama (saya potong untuk singkat, tapi gunakan yang lengkap dari kode Anda)
let games = [
    // ... (paste seluruh array games dari kode asli Anda di sini)
];

// Helper function to generate simple token
function generateToken() {
    return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

// API Endpoints (tetap sama, tapi saya pastikan handle error)
app.get('/api/games', (req, res) => {
    res.json(games);
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = Object.values(userData).find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, balance: user.balance } });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    const existingUser = Object.values(userData).find(u => u.username === username || u.email === email);
    if (existingUser) {
        res.status(400).json({ success: false, message: 'User already exists' });
    } else {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newId = Object.keys(userData).length + 1;
        const newUser = { id: newId, username, email, password: hashedPassword, verified: true, avatar: 'default-avatar.png', balance: 0, wishlist: [], library: [], cart: [] };
        userData[newId] = newUser;
        saveUserData();
        res.json({ success: true, message: 'Registration successful. Please check your email for verification.' });
    }
});

// Email verification
app.get('/api/verify/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const user = userData[userId];
    if (user) {
        user.verified = true;
        saveUserData();
        res.send('Email verified successfully!');
    } else {
        res.status(404).send('User not found');
    }
});

// Get user profile (requires token)
app.get('/api/user', (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const user = userData[userId];
        if (user) {
            res.json({ success: true, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, verified: user.verified, balance: user.balance } });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (err) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// Add/Remove from wishlist
app.post('/api/wishlist', (req, res) => {
    const { userId, gameId, action } = req.body;
    if (!userData[userId]) userData[userId] = { wishlist: [], library: [], cart: [] };
    if (action === 'add' && !userData[userId].wishlist.includes(gameId)) {
        userData[userId].wishlist.push(gameId);
    } else if (action === 'remove') {
        userData[userId].wishlist = userData[userId].wishlist.filter(id => id !== gameId);
    }
    saveUserData();
    res.json({ success: true, wishlist: userData[userId].wishlist });
});

// Add/Remove/Update cart
app.post('/api/cart', (req, res) => {
    const { userId, gameId, action, quantity } = req.body;
    if (!userData[userId]) userData[userId] = { wishlist: [], library: [], cart: [] };
    const cartItem = userData[userId].cart.find(item => item.gameId === gameId);
    if (action === 'add') {
        if (cartItem) {
            cartItem.quantity += quantity || 1;
        } else {
            userData[userId].cart.push({ gameId, quantity: quantity || 1 });
        }
    } else if (action === 'remove') {
        userData[userId].cart = userData[userId].cart.filter(item => item.gameId !== gameId);
    } else if (action === 'update') {
        if (cartItem) {
            cartItem.quantity = quantity;
            if (cartItem.quantity <= 0) {
                userData[userId].cart = userData[userId].cart.filter(item => item.gameId !== gameId);
            }
        }
    }
    res.json({ success: true, cart: userData[userId].cart });
});

// Add to library (purchase)
app.post('/api/library', (req, res) => {
    const { userId, gameId } = req.body;
    if (!userData[userId]) userData[userId] = { wishlist: [], library: [], cart: [] };
    if (!userData[userId].library.includes(gameId)) {
        userData[userId].library.push(gameId);
        userData[userId].cart = userData[userId].cart.filter(item => item.gameId !== gameId);
    }
    saveUserData();
    res.json({ success: true, library: userData[userId].library });
});

// Get user data
app.get('/api/user-data/:userId', (req, res) => {
    const userId = req.params.userId;
    if (userData[userId]) {
        res.json({ success: true, data: userData[userId] });
    } else {
        res.json({ success: true, data: { wishlist: [], library: [], cart: [] } });
    }
});

// Update user avatar
app.post('/api/avatar', (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.userId;
        const { avatar } = req.body;
        const user = userData[userId];
        if (user) {
            user.avatar = avatar;
            saveUserData();
            res.json({ success: true, avatar });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (err) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// Get recommendations for user
app.get('/api/recommendations/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const userInfo = userData[userId];
    if (!userInfo) return res.json({ success: true, recommendations: [] });

    const userGenres = new Set();
    const userGames = [...userInfo.library, ...userInfo.wishlist];
    userGames.forEach(gameId => {
        const game = games.find(g => g.id === gameId);
        if (game) game.genre.forEach(genre => userGenres.add(genre));
    });

    const recommendations = games.filter(game =>
        !userGames.includes(game.id) &&
        game.genre.some(genre => userGenres.has(genre))
    ).slice(0, 5);

    res.json({ success: true, recommendations });
});

// Add review
app.post('/api/reviews', (req, res) => {
    const { gameId, user, rating, comment } = req.body;
    const game = games.find(g => g.id === parseInt(gameId));
    if (game) {
        const userObj = Object.values(userData).find(u => u.username === user);
        const avatar = userObj ? userObj.avatar : 'default-avatar.png';
        const newReview = { gameId: parseInt(gameId), user, rating: parseFloat(rating), comment, date: new Date().toISOString(), avatar };
        game.reviews.push(newReview);
        reviews.push(newReview);
        saveReviews();
        res.json({ success: true, reviews: game.reviews });
    } else {
        res.status(404).json({ success: false, message: 'Game not found' });
    }
});

// For Vercel deployment
module.exports = app;

// For local development
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
