const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Storage config with random filename
defineUploadDir();
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const randomName = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, randomName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    // Accept only certain file types (basic example)
    const allowed = ['.png', '.jpg', '.jpeg', '.pdf', '.txt', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Ensure uploads directory exists
function defineUploadDir() {
  const dir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

// AES-256 encryption key
const ENCRYPTION_KEY = crypto.randomBytes(32); // 256-bit key
const IV_LENGTH = 16;

function encryptFile(inputPath, outputPath) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);
  output.write(iv); // prepend IV
  input.pipe(cipher).pipe(output);
}

function isFileSafe(filePath) {
  // Placeholder for virus scan or advanced checks
  // For now, just check file size and extension again
  const allowed = ['.png', '.jpg', '.jpeg', '.pdf', '.txt', '.docx'];
  const ext = path.extname(filePath).toLowerCase();
  const stats = fs.statSync(filePath);
  return allowed.includes(ext) && stats.size <= 10 * 1024 * 1024;
}

// POST /upload endpoint
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const filePath = req.file.path;
  if (!isFileSafe(filePath)) {
    fs.unlinkSync(filePath);
    return res.status(400).json({ error: 'Unsafe file detected' });
  }
  // Encrypt file after upload
  const encryptedPath = filePath + '.enc';
  encryptFile(filePath, encryptedPath);
  fs.unlinkSync(filePath); // Remove original
  res.json({
    message: 'File uploaded and encrypted successfully',
    filename: path.basename(encryptedPath)
  });
});

// GET /download/:filename endpoint
router.get('/download/:filename', (req, res) => {
  const encryptedPath = path.join(__dirname, 'uploads', req.params.filename);
  if (!fs.existsSync(encryptedPath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  // Decrypt on the fly and stream to response
  const input = fs.createReadStream(encryptedPath);
  let iv;
  let decipher;
  let started = false;
  input.on('readable', () => {
    if (!started) {
      iv = input.read(16);
      if (!iv) return;
      decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      started = true;
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename.replace('.enc', '')}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      input.pipe(decipher).pipe(res);
    }
  });
  input.on('error', (err) => {
    res.status(500).json({ error: 'Error reading file' });
  });
});

module.exports = router;
