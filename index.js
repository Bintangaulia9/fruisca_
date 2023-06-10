const express = require('express');
const admin = require('firebase-admin');
const multer = require('multer');
const fs = require('fs');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bcrypt = require('bcrypt');
const axios = require('axios');

const app = express();
const port = 8080;

// Konfigurasi Firebase
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://upload-b5b78-default-rtdb.asia-southeast1.firebasedatabase.app/',
  storageBucket: 'gs://upload-b5b78.appspot.com'
});

const db = admin.database();
const bucket = admin.storage().bucket();

// Konfigurasi Multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware untuk mengizinkan akses dari domain lain (CORS)
app.use(cors());

// Middleware untuk mengizinkan penggunaan JSON dalam body request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));





// Route untuk registrasi pengguna
app.post('/register', async (req, res) => {
  try {
    const { nama, email, password, tempatTinggal, noTelepon } = req.body;

    // Mendeklarasikan variabel passwordHash
    //let passwordHash;
    // Meng-hash kata sandi sebelum menyimpannya
    const hashedPassword = await hashPassword(password);
    // Mendefinisikan variabel passwordHash dengan nilai hashedPassword
    passwordHash = hashedPassword;

    // Buat pengguna baru di Firebase Authentication
    const userRecord = await admin.auth().createUser({
      nama: nama,
      email: email,
      password: hashedPassword,
    });

    // Simpan informasi pengguna di Firebase Realtime Database
    const userData = {
      email: email,
      tempatTinggal: tempatTinggal,
      noTelepon: noTelepon,
      passwordHash: hashedPassword,
    };

    
    // Periksa setiap properti dan tambahkan ke userData jika memiliki nilai yang valid
    if (nama) {
      userData.nama = nama;
    }
    if (email) {
      userData.email = email;
    }
    if (tempatTinggal) {
      userData.tempatTinggal = tempatTinggal;
    }
    if (noTelepon) {
      userData.noTelepon = noTelepon;
    }

    // Simpan data ke Firebase Realtime Database
    const databaseRef = admin.database().ref('users').child(userRecord.uid);
    await databaseRef.set(userData);

    // await admin.database().ref('users').child(userRecord.uid).set(userData);

    res.status(200).json({ message: 'Registration successful', 
    data : {
      nama: nama,
      email: email,
      password: password,
      tempatTinggal: tempatTinggal,
      noTelepon: noTelepon,
    } 
  });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// Fungsi untuk meng-hash kata sandi
async function hashPassword(password) {
  try {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Password hashing failed');
  }
}

// Fungsi untuk memverifikasi kata sandi
async function verifyPassword(password, passwordHash) {
  try {
    if (!password || !passwordHash) {
      throw new Error('Data and hash arguments are required');
    }

    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    return isPasswordValid;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}


// Validasi format email
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}




/// Route untuk login pengguna
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validasi format email
    if (!validateEmail(email)) {
      res.status(400).json({ message: 'Invalid email format' });
      return;
    }

    // Ambil pengguna berdasarkan email
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const { displayName, email: userEmail, uid } = userRecord;
    
    // Ambil data pengguna dari Firebase Realtime Database
    const snapshot = await admin.database().ref('users').child(uid).once('value');
    const userData = snapshot.val();

    if (!password || !userData || !userData.passwordHash) {
      res.status(400).json({ message: 'Invalid request' });
      return;
    }


    // Memperbarui userData dengan displayName dari userRecord
    userData.displayName = displayName;
    
    const isPasswordValid = await verifyPassword(password, userData.passwordHash);

    if (isPasswordValid) {
      // Login berhasil
      console.log('Login successful');

      res.status(200).json({
        message: 'Login successful',
        data: {
          uid: uid,
          nama: displayName,
          email: userEmail,
        },
      });
    } 
    else {
      // Login gagal
      console.log('Password salah');
      res.status(401).json({ message: 'Password salah' });
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});


// Route untuk melihat semua data pengguna
app.get('/users', async (req, res) => {
  try {
    const snapshot = await admin.database().ref('users').once('value');
    const users = snapshot.val();

    // Membuat array untuk menyimpan data pengguna dengan nama dan email
    const usersData = [];

    // Loop melalui pengguna dan menambahkan data ke array
    Object.keys(users).forEach((userId) => {
      const userData = users[userId];

      // Memeriksa apakah ada properti 'nama' dan 'email'
      if (userData.nama && userData.email) {
        usersData.push({
          uid: userId,
          nama: userData.nama,
          email: userData.email,
          tempatTinggal: userData.tempatTinggal,
          noTelepon: userData.noTelepon,
        });
      }
    });

    console.log('get users is success');
    res.status(200).json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ message: 'Failed to get users' });
  }
});


// Endpoint untuk mendapatkan profil pengguna
app.get('/profile/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Mendapatkan data pengguna dari Realtime Database
    const snapshot = await admin.database().ref('users/' + userId).once('value');
    const profile = snapshot.val();

    if (profile) {
      if (profile.displayName) {
        console.log('Nama:', profile);
      } else {
        console.log('profil user');
      }
      res.status(200).json(profile);
    } else {

      console.log('User not found')
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ message: 'Failed to get user profile' });
  }
});


// Route untuk mereset password pengguna
app.post('/reset-password', async (req, res) => {
  try {
    const { email, password, newPassword } = req.body;

    // Validasi format email
    if (!validateEmail(email)) {
      res.status(400).json({ message: 'Invalid email format' });
      return;
    }

    // Ambil pengguna berdasarkan email
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const { uid } = userRecord;

    // Meng-hash kata sandi baru
    const newHashedPassword = await hashPassword(newPassword);

    // Memperbarui kata sandi di Firebase Authentication
        await admin.auth().updateUser(uid, { password: newHashedPassword });

    // Ambil data pengguna dari Firebase Realtime Database
    const snapshot = await admin.database().ref('users').child(uid).once('value');
    const userData = snapshot.val();


    // Memperbarui kata sandi di Firebase Realtime Database
    await admin.database().ref('users').child(uid).update({ passwordHash: newHashedPassword });

    // Memperbarui data pengguna yang diperbarui dengan UID baru
    userData.uid = uid;

    // Tampilkan data pengguna yang diperbarui di Visual Studio Code
    console.log('Password reset successful');

    res.status(200).json({ 
      message: 'Password reset successful',
      data: userData
    });
  } catch (error) {
    console.error('Error during password reset:', error);
    res.status(500).json({ message: 'Password reset failed' });
  }
});

// Route untuk logout pengguna
app.post('/logout', async (req, res) => {
  try {
    // Mendapatkan token akses dari header Authorization
    const authorizationHeader = req.headers.authorization;
    const accessToken = authorizationHeader ? authorizationHeader.split(' ')[1] : null;

    // Memvalidasi token akses
    if (!accessToken) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // Memutakhirkan token akses di Firebase Authentication
    await admin.auth().revokeRefreshTokens(accessToken);

    // Menghapus token akses dari Firebase Realtime Database
    const tokenRef = admin.database().ref('tokens').child(accessToken);
    await tokenRef.remove();

    // Menampilkan informasi pengguna di terminal Visual Studio
    console.log('User logged out');

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
});


// Mengunggah gambar dan melakukan proses scan
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    // Simpan gambar ke Firebase Storage
    const file = req.file;
    const fileName = `${uuidv4()}-${file.originalname}`;
    const fileBuffer = file.buffer;

    const writeFile = promisify(fs.writeFile);
    await writeFile(fileName, fileBuffer);

    const uploadOptions = {
      destination: `images/${fileName}`,
      metadata: {
        contentType: file.mimetype
      }
    };

    await bucket.upload(fileName, uploadOptions);

    // Proses scan gambar
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${uploadOptions.destination}`;
    const scanResult = await performScan(imageUrl);

    // Simpan data hasil scan ke Firebase Database
    const scanDataRef = db.ref('scans');
    await scanDataRef.push(scanResult);

    // Simpan data hasil scan ke menu history
    const historyDataRef = db.ref('history');
    const historyEntry = {
      imageUrl,
      scanResult,
      timestamp: Date.now()
    };
    await historyDataRef.push(historyEntry);

    // Hapus file sementara yang diunggah
    await promisify(fs.unlink)(fileName);

    res.status(200).json({ message: 'Gambar berhasil diunggah dan diproses.' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat mengunggah dan memproses gambar.' });
  }
});



// Fungsi untuk melakukan proses scan menggunakan model JSON datasite
async function performScan(imageUrl) {
  try {
    // Mengirim permintaan POST ke endpoint model JSON datasite
    const response = await axios.post('<model_endpoint>', {
      image_url: imageUrl
    });

    // Mendapatkan hasil scan dari respons model
    const scanResult = response.data;

    // Mengembalikan hasil scan
    return scanResult;
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Terjadi kesalahan saat melakukan proses scan.');
  }
}


// Fungsi untuk melakukan proses scan (digantikan dengan implementasi sesuai kebutuhan Anda)
//async function performScan(imageUrl) {
  // Implementasi proses scan sesuai kebutuhan Anda
  // ...

  // Contoh hasil scan
 // return {
  //  fruitType: 'Apple',
  //  fruitRipeness: 'Ripe',
  //  fruitRot: 'Not rotten'
  //};
//}

// Mengambil data dari menu history
app.get('/history', async (req, res) => {
  try {
    const historyDataRef = db.ref('history');

    // Mendapatkan data dari Firebase Database
    const snapshot = await historyDataRef.once('value');
    const historyData = snapshot.val();

    // Tambahkan informasi waktu pemindaian sesuai dengan waktu pengguna
    const historyWithTime = Object.entries(historyData).map(([key, value]) => {
      const timestamp = value.timestamp;
      const date = new Date(timestamp).toLocaleString();
      return { ...value, scanTime: date };
    });

    res.status(200).json(historyWithTime);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data history.' });
  }
});

// Mengunggah gambar dari kamera dan melakukan proses scan
app.post('/capture', upload.single('image'), async (req, res) => {
  try {
    // Simpan gambar ke Firebase Storage
    const file = req.file;
    const fileName = `${uuidv4()}-${file.originalname}`;
    const fileBuffer = file.buffer;

    const writeFile = promisify(fs.writeFile);
    await writeFile(fileName, fileBuffer);

    const uploadOptions = {
      destination: `images/${fileName}`,
      metadata: {
        contentType: file.mimetype
      }
    };

    await bucket.upload(fileName, uploadOptions);

    // Proses scan gambar
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${uploadOptions.destination}`;
    const scanResult = await performScan(imageUrl);

    // Simpan data hasil scan ke Firebase Database
    const scanDataRef = db.ref('scans');
    await scanDataRef.push(scanResult);

    // Simpan data hasil scan ke menu history
    const historyDataRef = db.ref('history');
    const historyEntry = {
      imageUrl,
      scanResult,
      timestamp: Date.now()
    };
    await historyDataRef.push(historyEntry);

    // Hapus file sementara yang diunggah
    await promisify(fs.unlink)(fileName);

    res.status(200).json({ scanResult });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan saat mengambil dan memproses gambar dari kamera.' });
  }
});

// Mulai server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});


