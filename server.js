//const sqlite3 = require('sqlite3');
const express = require('express');
const session = require('express-session');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const path = require('path');
const port = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const crypto = require('crypto');
app.use(session({
    secret: crypto.randomBytes(64).toString('hex'), // 这是用于签名会话ID的字符串
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24小时
}));
const { v4: uuidv4 } = require('uuid');// 設置 multer 來存儲圖片
const multer = require('multer');
//設定上傳的圖片儲存格式
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // 设置上传文件的目标目录为 'uploads/'
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = uuidv4(); // 生成唯一 ID
        cb(null, `${uniqueSuffix}-${Date.now()}`); // 设置上传文件的文件名为唯一ID加上当前时间戳
    }
});
const upload = multer({ storage: storage });
// 打開資料庫連接
const db = new sqlite3.Database('./database_books.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.error(err.message);
    console.log('Connected to the database.');
});
//const db = new sqlite3.Database('./database_books.db');

///////////////////////////////////推薦TEST////////////////////////////////////
app.get('/api/RecommendBooks', (req, res) => {
    const userID = req.session.username;

    db.all('SELECT course_name FROM courses WHERE user_id = ?', userID, (err, courseRows) => {
        if (err) {
            console.error('Error fetching courses:', err);
            return res.status(500).send('Database error.');
        }

        if (courseRows.length === 0) {
            return res.json([]);  // 如果没有找到课程，返回空数组
        }

        // 提取 course_name 并生成 LIKE 查询条件
        const courseNames = courseRows.map(row => row.course_name);
        const likeClauses = courseNames.map(name => `book_course LIKE ?`).join(' OR ');
        const params = courseNames.map(name => `%${name}%`);

        const query = `SELECT book_id, book_name, book_college, book_department, user_id, book_pic, book_course FROM book WHERE ${likeClauses}`;

        db.all(query, params, (err, bookRows) => {
            if (err) {
                console.error('Error fetching books:', err);
                return res.status(500).send('Database error.');
            }

            // 返回查询结果
            //console.log('推薦書籍:', bookRows);
            res.json(bookRows);
        });
    });
});

///////////////////////////////////推薦TEST////////////////////////////////////
//////////////////////////////////////////////////index block//////////////////////////////////////////////////
//分類按鈕
app.get('/api/books/category/:category', (req, res) => {
    const { category } = req.params;
    const sql = 'SELECT book_id, book_name, book_college, book_department, user_id, book_pic FROM book WHERE book_college LIKE ? OR book_department LIKE ?';
    const params = [`%${category}%`, `%${category}%`];

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        if (rows.length > 0) {
            res.json(rows);
        } else {
            res.status(404).json({ message: 'No books found for this category' });
        }
    });
    const username = req.session.username;
    if(username===undefined){
        console.log(`Nonlogged presses '${category}'`);
    }
    else{
        console.log(`${username} presses '${category}'`);
    }
});


//檢查是否已加入過購物車
app.post('/api/checkInCart', (req, res) => {
    const { book_id, user_id } = req.body;
    //console.log('Received data for checking:', req.body);

    // 检查必填字段
    if (!book_id || !user_id) {
        console.error('Missing book_id or user_id');
        return res.status(400).json({ success: false, message: '缺少book_id或user_id' });
    }

    //console.log(`checkInCart - book_id: ${book_id}, user_id: ${user_id}`);

    // 查询 cart 表
    const query = 'SELECT * FROM cart WHERE book_id = ? AND user_id = ?';
    db.get(query, [book_id, user_id], (err, row) => {
        if (err) {
            console.error('Error querying cart:', err);
            return res.status(500).json({ success: false, message: 'server error' });
        }

        // 返回书籍是否存在的状态
        res.json({ success: true, exists: !!row });
    });
});


// //顯示user該科系所有資料//user登入後未爬蟲//可以刪除??
// app.get('/api/books/department/:user_id', (req, res) => {
//     const userId = req.params.user_id;
//     // 查詢該用戶的系所
//     const getUserDept = 'SELECT user_dept FROM users WHERE user_id = ?';
//     db.get(getUserDept, [userId], (err, row) => {
//         if (err) {
//             console.error(err.message);
//             return res.status(500).send('Internal Server Error');
//         }

//         if (!row) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         const userDept = row.user_dept;

//         // 根據系所查詢書籍
//         const getBooksByDept = 'SELECT book_id, book_name, book_college, book_department, user_id, book_pic FROM book WHERE book_department = ?';
//         db.all(getBooksByDept, [userDept], (err, books) => {
//             if (err) {
//                 console.error(err.message);
//                 return res.status(500).send('Internal Server Error');
//             }

//             if (books.length > 0) {
//                 res.json(books);
//             } else {
//                 res.status(404).json({ message: 'No books found for this department' });
//             }
//         });
//     });
//     console.log('搜索');
// });

//....................................................................................................//
//////////////////////////////////////////////////inser block//////////////////////////////////////////////////
//inser頁面 user上傳的所有書籍
app.get('/api/insertedbooks', (req, res) => {
    const userId = req.session.username;
    if (!userId) {
        return res.status(401).json({ message: 'User not logged in' });
    }
    const sql = 'SELECT book_id, book_name, book_college, book_department, user_id, book_course, book_pic FROM book WHERE user_id = ?';

    db.all(sql, [userId], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        if (rows.length > 0) {
            res.json(rows);
        } else {
            res.status(404).json({ message: 'No books found for this user' });
        }
    });

    console.log(`Fetched books for user ${userId}`);
});




// 删除书籍的 API
app.delete('/api/deleteBook/:id', (req, res) => {
    const bookId = req.params.id;
    const userId = req.session.username;

    if (!userId) {
        return res.status(401).json({ message: 'User not logged in' });
    }

    const sql = 'DELETE FROM book WHERE book_id = ? AND user_id = ?';
    db.run(sql, [bookId, userId], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ message: 'Failed to delete book' });
        }

        if (this.changes > 0) {
            res.json({ message: 'Book deleted successfully' });
        } else {
            res.status(404).json({ message: 'Book not found or not owned by the user' });
        }
    });
});

//....................................................................................................//
//////////////////////////////////////////////////cart block//////////////////////////////////////////////////
//顯示user的購物車內容在car頁面
app.get('/api/cart', (req, res) => {
    // 從 session 中獲取用戶 ID
    const userId = req.session.username;
    
    // 如果用戶 ID 不存在，返回 400 錯誤
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    
    // 從 cart 表中獲取該用戶的所有購物車項目
    db.all('SELECT cart_id, book_id FROM cart WHERE user_id = ?', [userId], (err, rows) => {
        if (err) {
            // 如果查詢過程中發生錯誤，返回 500 錯誤
            return res.status(500).json({ error: err.message });
        }

        // 獲取所有購物車項目的書籍 ID
        const bookIds = rows.map(row => row.book_id);
        const cartItems = rows;

        // 如果購物車中沒有任何項目，返回成功信息和空數據
        if (bookIds.length === 0) {
            return res.json({
                message: "success",
                data: []
            });
        }

        // 準備查詢 book 表的 SQL 語句，使用 IN 子句查詢所有在 bookIds 中的書籍
        const placeholders = bookIds.map(() => '?').join(',');
        const sql = `SELECT * FROM book WHERE book_id IN (${placeholders})`;

        // 查詢所有與購物車項目相關的書籍
        db.all(sql, bookIds, (err, books) => {
            if (err) {
                // 如果查詢過程中發生錯誤，返回 500 錯誤
                return res.status(500).json({ error: err.message });
            }

            // 將購物車項目與書籍數據結合起來
            const result = cartItems.map(item => {
                const book = books.find(b => b.book_id === item.book_id);
                return {
                    cart_id: item.cart_id,
                    book_id: item.book_id,
                    book: book
                };
            });

            // 返回成功信息和結合後的數據
            res.json({
                message: "success",
                data: result
            });
        });
    });
});

//刪除購物車內容功能
app.delete('/api/cart/:cartId', (req, res) => {
    const cartId = req.params.cartId;
    const userId = req.session.username; // Get the user ID from the session

    if (!userId) {
        return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const sql = 'DELETE FROM cart WHERE cart_id = ? AND user_id = ?';
    db.run(sql, [cartId, userId], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ success: false, message: "Error deleting cart item" });
        }
        if (this.changes > 0) {
            res.json({ success: true, message: "Cart item deleted successfully" });
        } else {
            res.status(404).json({ success: false, message: "Cart item not found or user not authorized" });
        }
    });
    console.log(`${userId} deleted cartId:${cartId}`)
});
//加入購物車
app.post('/api/addToCart', (req, res) => {
    const { book_id, user_id } = req.body;
    //console.log('Received data:', req.body);

    // 检查必填字段
    if (!book_id || !user_id) {
        console.error('Missing book_id or user_id');
        return res.status(400).json({ success: false, message: '缺少book_id或user_id' });
    }

    //console.log(`addToCart - book_id: ${book_id}, user_id: ${user_id}`);
    console.log(`${user_id} add bookId:${book_id} to Cart`);
    // 插入数据到 cart 表
    const query = 'INSERT INTO cart (book_id, user_id) VALUES (?, ?)';
    db.run(query, [book_id, user_id], function(err) {
        if (err) {
            console.error('Error inserting into cart:', err);
            return res.status(500).json({ success: false, message: '服务器错误' });
        }
        res.json({ success: true });
    });
});

//....................................................................................................//
//////////////////////////////////////////////////用戶資料 block//////////////////////////////////////////////////
//登入狀態
app.get('/checkLoginStatus', (req, res) => {
    if (req.session.username) {
        res.json({ loggedIn: true, username: req.session.username });
    } else {
        res.json({ loggedIn: false });
    }
    //console.log(`/checkLoginStatus`);
});
//查詢user的point
app.get('/api/userPoint', (req, res) => {
    // 确保用户已经登录
    if (!req.session.username) {
        return res.status(401).json({ error: 'User is not logged in' });
    }

    const userId = req.session.username; // 从 session 中获取用户 ID

    // 查询数据库获取用户积分
    db.get('SELECT user_point FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'User is not found' });
        }

        res.json({ userPoint: row.user_point });
    });
});

// 獲取課程資料路由
app.get('/courses', (req, res) => {
    if (!req.session.username) {
        res.status(401).json({ message: 'Not logged in' });
        return;
    }
    db.all('SELECT course_name FROM courses WHERE user_id = ?', [req.session.username], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});

// 獲取基本資料路由
app.get('/userinfo', (req, res) => {
    if (!req.session.username) {
        res.status(401).json({ message: 'Not logged in' });
        return;
    }
    db.get('SELECT user_name, user_coll, user_dept, user_grade, user_point FROM users WHERE user_id = ?', [req.session.username], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (row) {
            res.json({ data: row });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    });
});
//....................................................................................................//
//////////////////////////////////////////////////編輯書籍 block//////////////////////////////////////////////////
// 插入書籍資料
const insertBookData = (bookName, bookCollege, bookDepartment, userId, bookImage, bookcourse, callback) => {
    const sql = 'INSERT INTO book (book_name, book_college, book_department, user_id, book_pic, book_course) VALUES (?, ?, ?, ?, ?, ?)';
    
    db.run(sql, [bookName, bookCollege, bookDepartment, userId, bookImage, bookcourse], function (err) {
        if (err) return console.error(err.message);
        
        console.log('Book data inserted.');
        const lastID = this.lastID; // 使用 this.lastID 來獲取插入的 ID
        console.log(`insertBook success - userId ${userId}  bookId ${lastID}`);
        
        callback(lastID); // 將插入的 ID 回傳
    });
};
// 處理表單提交，插入書籍資料
app.post('/api/addBook', upload.single('bookImage'), (req, res) => {
    const { bookName, bookCollege, bookDepartment, userId, bookcourse } = req.body;
    const bookImage = req.file ? req.file.path : null;
    insertBookData(bookName, bookCollege, bookDepartment, userId, bookImage, bookcourse, (id) => {
        res.json({ id, message: 'Book added successfully' });
    });
    console.log('處理表單提交，插入書籍資料');
});

// // 示例路由，用于处理文件上传
// app.post('/upload', upload.single('file'), (req, res) => {
//     res.send('File uploaded successfully.');
// });

// 路由：獲取所有書籍資料
app.get('/api/books', (req, res) => {
    const sql = 'SELECT book_id, book_name, book_college, book_department, user_id, book_pic, book_course FROM book';
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        res.json(rows);
    });
    //console.log('獲取所有書籍資料')
});

//關鍵字搜尋書籍(書名,學院,系所)
app.get('/api/searchBooks', (req, res) => {
    const query = req.query.query;
    const sql = 'SELECT book_name, book_college, book_department, book_course, book_pic FROM book WHERE book_name LIKE ? OR book_college LIKE ? OR book_department LIKE ? OR book_course LIKE ?';
    const params = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        res.json(rows);
    });
    const username = req.session.username;
    if(username===undefined){
        console.log(`Nonlogged search '${query}'`);
    }
    else{
        console.log(`${username} search '${query}'`);
    }
});


//....................................................................................................//
//////////////////////////////////////////////////可刪除 block//////////////////////////////////////////////////。。
// // 插入使用者資料
// const insertUserData = (email, password, callback) => {
//     const sql = 'INSERT INTO users(email, password) VALUES (?, ?)';
//     db.run(sql, [email, password], function (err) {
//         if (err) return console.error(err.message);
//         console.log('User data inserted.');
//         callback(this.lastID); // 將插入的 ID 回傳
//     });
//     console.log('插入使用者資料');
// };

// // 處理表單提交，插入使用者資料
// app.post('/addUser', express.json(), (req, res) => {
//     const { email, password } = req.body;
//     insertUserData(email, password, (id) => {
//         res.json({ id, message: 'User added successfully' });
//     });
//     console.log('處理表單提交，插入使用者資料');
// });

// // 刪除指定的使用者資料
// const deleteUser = (id, callback) => {
//     const sql = 'DELETE FROM users WHERE id = ?';
//     db.run(sql, [id], function (err) {
//         if (err) return console.error(err.message);
//         callback(this.changes); // 回傳受影響的行數
//     });
//     console.log("刪除指定的使用者資料")
// };

// // 處理刪除指定使用者資料的請求
// app.delete('/deleteUser/:id', (req, res) => {
//     const { id } = req.params;
//     deleteUser(id, (changes) => {
//         if (changes) {
//             res.json({ success: true, message: 'User deleted successfully' });
//         } else {
//             res.json({ success: false, message: 'User not found' });
//         }
//     });
//     console.log('處理刪除指定使用者資料的請求')
// });
// // 路由：獲取使用者數據
// app.get('/users', (req, res) => {
//     const sql = 'SELECT id, email, password FROM users';
//     db.all(sql, [], (err, rows) => {
//         if (err) {
//             console.error(err.message);
//             return res.status(500).send('Internal Server Error');
//         }
//         res.json(rows);
//     });
//     console.log('獲取所有使用者數據')
// });

// app.get('/api/searchBooks', (req, res) => {
//     const query = req.query.query;
//     const sql = 'SELECT book_name, book_college, book_department, user_id, book_pic FROM book WHERE book_name LIKE ? OR book_college LIKE ? OR book_department LIKE ?';
//     const params = [`%${query}%`, `%${query}%`, `%${query}%`];

//     db.all(sql, params, (err, rows) => {
//         if (err) {
//             console.error(err.message);
//             return res.status(500).send('Internal Server Error');
//         }
//         res.json(rows);
//     });
// });

//....................................................................................................//
//////////////////////////////////////////////////其他 block//////////////////////////////////////////////////

// 設定靜態資源路徑
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

//首頁路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// app.get('/inser', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'test.html'));
// });

app.listen(port, () => {
    console.log(`Server is running on http://127.0.0.1:3000/`);
});
//....................................................................................................//
//////////////////////////////////////////////////登入 block//////////////////////////////////////////////////
//註冊
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userExists = await checkUserExists(username);
        if (!userExists) {
            const crawlSuccess = await crawlAndVerify(username, password);
            if (crawlSuccess) {
                req.session.username = username;
                res.json({ success: true, username: username });
            } else {
                res.json({ success: false, err_message: "帳號或密碼錯誤" });
            }
        } else {
            res.json({ success: false, err_message: "用戶已存在" });
        }
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, err_message: "伺服器錯誤" });
    }
});
// 檢查用戶是否存在
function checkUserExists(username) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM users WHERE user_id = ?", [username], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row !== undefined);
            }
        });
    });
}

// 驗證密碼
function verifyPassword(username, password) {
    return new Promise((resolve, reject) => {
        db.get("SELECT user_password FROM users WHERE user_id = ?", [username], (err, row) => {
            if (err) {
                reject(err);
                //console.log('驗證錯誤')
            } else {
                resolve(row && row.user_password === password);
                //console.log('驗證成功')
            }
        });
    });
}

// 登录路由
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    //console.log("Received username:", username); // 打印提交的用户名

    try {
        const userExists = await checkUserExists(username);
        if (userExists) {
            //console.log('用戶存在');
            const passwordCorrect = await verifyPassword(username, password);
            if (passwordCorrect) {
                req.session.username = username;
                res.json({ success: true });
                //console.log("导向index  登录成功");
                console.log(`${username} Successful login`);
            } else {
                res.json({ success: false, err_message: "密碼錯誤" });
            }
        } else {
            res.json({ success: false, err_message: "帳號不存在" });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, err_message: "Server error" });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).json({ success: false, message: "登出失敗" });
        } else {
            res.json({ success: true });
            console.log("登出成功")
        }
    });
});

// 注销路由
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, err_message: "注销失败" });
        }
        res.json({ success: true });
    });
});
//....................................................................................................//
//////////////////////////////////////////////////爬蟲 block//////////////////////////////////////////////////
// 爬蟲和驗證
function crawlAndVerify(username, password) {
    return new Promise((resolve, reject) => {
        exec(`python scraper.py ${username} ${password}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`執行錯誤: ${error}`);
                resolve(false);
                return;
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
                resolve(false);
                return;
            }
            const result = JSON.parse(stdout);
            resolve(result.success);
        });
    });
}
// 重新爬蟲路由
app.post('/crawl', (req, res) => {
    if (!req.session.username) {
        res.status(401).json({ success: false, message: 'Not logged in' });
        return;
    }

    const username = req.session.username;

    // 查询用户密码
    db.get('SELECT user_password FROM users WHERE user_id = ?', [username], (err, row) => {
        if (err) {
            console.error('Error fetching user password:', err);
            res.status(500).json({ success: false, message: 'Error fetching user password' });
            return;
        }

        if (!row) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        const password = row.user_password;

        // 执行爬虫脚本
        const pythonScriptPath = path.join(__dirname, 'rescraper.py'); // 确保你的爬虫脚本路径正确
        exec(`python ${pythonScriptPath} ${username} ${password}`, (error, stdout, stderr) => {
            if (error) {
                console.error('Crawling error:', stderr);
                res.status(500).json({ success: false, message: 'Crawling failed' });
                return;
            }

            const result = JSON.parse(stdout);
            if (result.success) {
                res.json({ success: true });
            } else {
                res.status(500).json({ success: false, message: 'Crawling failed' });
            }            
        });
    });
});
//....................................................................................................//
// 聊天訊息的 API
app.post('/send-message', (req, res) => {
    const { message } = req.body;
    const user = req.session.username; // 這裡的 user 可以從 session 或 token 中獲取
    const chat_id = '20230001_1'; // 這是範例聊天室ID

    const timestamp = new Date().toISOString();
    
    // 插入訊息到資料庫
    db.run(`INSERT INTO chats (chat_id, user_id, message, timestamp) VALUES (?, ?, ?, ?)`,
        [chat_id, user, message, timestamp], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ user, message, timestamp });
        });
});
db.run('PRAGMA foreign_keys = ON');
// 建立 chats 資料表
db.run(`
    CREATE TABLE IF NOT EXISTS chats (
        chat_id TEXT,
        user_id TEXT,
        message TEXT,
        timestamp DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        PRIMARY KEY (chat_id, timestamp)
    )
`);

