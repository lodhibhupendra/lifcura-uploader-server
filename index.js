import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import ImageKit from 'imagekit';
import { v4 as uuidv4 } from 'uuid';

// Env vars
const PORT = process.env.PORT || 4000;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || 'http://localhost:3000';
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY;
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY; // keep secret (server only)
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT; // e.g., https://ik.imagekit.io/your_id
const IMAGEKIT_FOLDER = process.env.IMAGEKIT_FOLDER || '/product-images';

if (!IMAGEKIT_PUBLIC_KEY || !IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
  console.error('Missing ImageKit environment variables. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT');
  process.exit(1);
}

const imagekit = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY,
  privateKey: IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: IMAGEKIT_URL_ENDPOINT,
});

const app = express();
// Robust CORS: support multiple allowed origins via comma-separated ALLOW_ORIGIN
const allowedOrigins = String(ALLOW_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function(origin, callback) {
    // Allow non-browser or same-origin requests (no origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Multer memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'Image uploader server is running.',
    endpoints: {
      health: '/health',
      upload: 'POST /upload (multipart/form-data, field name: file)'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const { originalname, mimetype, buffer } = req.file;
    if (!mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed' });
    }

    const safeName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}-${uuidv4()}-${safeName}`;

    // Upload to ImageKit (signed, server-side)
    const result = await imagekit.upload({
      file: buffer, // Buffer
      fileName,
      folder: IMAGEKIT_FOLDER,
      useUniqueFileName: false,
      isPrivateFile: false, // set true if you want signed (time-limited) URLs
      tags: ['lifcura', 'product'],
    });

    if (!result?.url) {
      return res.status(500).json({ error: 'ImageKit upload failed' });
    }

    return res.json({ url: result.url, fileId: result.fileId });
  } catch (e) {
    console.error('Upload handler error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

// Delete image by ImageKit fileId
app.delete('/image', async (req, res) => {
  try {
    const { fileId } = req.body || {};
    if (!fileId) return res.status(400).json({ error: 'fileId is required' });
    await imagekit.deleteFile(fileId);
    return res.json({ ok: true });
  } catch (e) {
    console.error('Delete handler error:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Uploader server listening on http://localhost:${PORT}`);
});
