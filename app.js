// 1. ضع هنا كود الإعداد الذي نسخته من Firebase
// !! هام جداً: استبدل هذا الكود بالكود الخاص بك !!
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAFMi4L-Um_bRY4Tm1XQKlxxv_eNdXtZJo",
  authDomain: "chat-cc24b.firebaseapp.com",
  databaseURL: "https://chat-cc24b-default-rtdb.firebaseio.com",
  projectId: "chat-cc24b",
  storageBucket: "chat-cc24b.firebasestorage.app",
  messagingSenderId: "236766665963",
  appId: "1:236766665963:web:c6e98448e4f797361132ae",
  measurementId: "G-T2Y11PMCXF"
};

// 2. تهيئة Firebase
firebase.initializeApp(firebaseConfig);

// 3. الحصول على الخدمات
const auth = firebase.auth();
const db = firebase.firestore();

// 4. الإشارة إلى عناصر الصفحة
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const appArea = document.getElementById('app');
const usersList = document.getElementById('usersList');
const chatHeader = document.getElementById('chatWithUser');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

// 5. متغيرات لحالة التطبيق
let currentUser = null;
let currentChatId = null;
let unsubscribeFromChat = null; // لتخزين دالة إلغاء الاشتراك في المحادثة الحالية

// 6. مراقبة حالة المصادقة
auth.onAuthStateChanged(user => {
    if (user) {
        // المستخدم مسجل دخوله
        currentUser = user;
        console.log("المستخدم:", user.displayName);
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        appArea.classList.remove('hidden');

        // حفظ المستخدم في Firestore (إن لم يكن موجوداً)
        saveUserToFirestore(user);
        
        // تحميل قائمة المستخدمين
        loadUsersList();
    } else {
        // المستخدم مسجل خروجه
        currentUser = null;
        console.log("تم تسجيل الخروج");
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        appArea.classList.add('hidden');
        usersList.innerHTML = ''; // إفراغ قائمة المستخدمين
    }
});

// 7. تسجيل الدخول
loginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .catch(error => console.error("خطأ في تسجيل الدخول:", error));
});

// 8. تسجيل الخروج
logoutBtn.addEventListener('click', () => {
    // قبل تسجيل الخروج، تأكد من إلغاء الاشتراك في أي محادثة مفتوحة
    if (unsubscribeFromChat) {
        unsubscribeFromChat();
    }
    auth.signOut();
});

// 9. دالة لحفظ المستخدم في collection 'users'
async function saveUserToFirestore(user) {
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    
    if (!doc.exists) {
        // مستخدم جديد، قم بإنشائه
        userRef.set({
            displayName: user.displayName,
            photoURL: user.photoURL,
            uid: user.uid
        }).catch(error => console.error("خطأ في حفظ المستخدم:", error));
    }
    // إذا كان موجوداً، لا تفعل شيئاً (يمكن تحديث البيانات هنا إذا رغبت)
}

// 10. دالة لتحميل وعرض قائمة المستخدمين
function loadUsersList() {
    db.collection('users').onSnapshot(snapshot => {
        usersList.innerHTML = ''; // إفراغ القائمة لإعادة بنائها
        snapshot.forEach(doc => {
            const user = doc.data();
            
            // لا تعرض المستخدم الحالي في القائمة
            if (user.uid === currentUser.uid) return;

            const li = document.createElement('li');
            li.textContent = user.displayName;
            li.dataset.uid = user.uid; // تخزين الـ uid لسهولة الوصول إليه
            li.dataset.name = user.displayName;
            
            // إضافة مستمع حدث النقر لبدء المحادثة
            li.addEventListener('click', () => startChat(user.uid, user.displayName));
            
            usersList.appendChild(li);
        });
    });
}

// 11. دالة لبدء المحادثة (أو فتحها)
async function startChat(otherUserId, otherUserName) {
    // إيقاف الاستماع للمحادثة القديمة (إن وجدت)
    if (unsubscribeFromChat) {
        unsubscribeFromChat();
    }
    
    // هذا هو "السحر": إنشاء معرف محادثة فريد وثابت
    // عن طريق ترتيب الـ UIDs أبجدياً ودمجها
    const myUid = currentUser.uid;
    currentChatId = [myUid, otherUserId].sort().join('_');
    
    // عرض رأس المحادثة
    chatHeader.textContent = `المحادثة مع ${otherUserName}`;
    messageForm.classList.remove('hidden'); // إظهار نموذج إرسال الرسائل
    messagesDiv.innerHTML = ''; // إفراغ الرسائل القديمة

    // التحقق مما إذا كان مستند المحادثة موجوداً، وإلا فأنشئه
    const chatRef = db.collection('chats').doc(currentChatId);
    const chatDoc = await chatRef.get();
    
    if (!chatDoc.exists) {
        await chatRef.set({
            users: [myUid, otherUserId] // إضافة المستخدمين للمحادثة (مهم للقواعد الأمنية)
        });
    }

    // الآن، ابدأ الاستماع للرسائل في هذه المحادثة *فقط*
    loadChatMessages(currentChatId);
}

// 12. دالة لتحميل والاستماع لرسائل محادثة معينة
function loadChatMessages(chatId) {
    const messagesCollection = db.collection('chats').doc(chatId).collection('messages')
                                 .orderBy('createdAt');

    // onSnapshot تستمع لأي تغييرات (رسائل جديدة)
    unsubscribeFromChat = messagesCollection.onSnapshot(snapshot => {
        messagesDiv.innerHTML = ''; // إفراغ الرسائل لعرض الجديدة
        snapshot.forEach(doc => {
            const message = doc.data();
            displayMessage(message);
        });
        
        // التمرير للأسفل
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// 13. دالة لعرض الرسالة على الشاشة
function displayMessage(message) {
    const div = document.createElement('div');
    div.classList.add('message');
    
    // تحديد إذا كانت الرسالة "مرسلة" أو "مستلمة"
    if (message.senderId === currentUser.uid) {
        div.classList.add('sent');
        div.textContent = message.text;
    } else {
        div.classList.add('received');
        div.textContent = message.text; // يمكنك إضافة اسم المرسل هنا إذا أردت
    }
    
    messagesDiv.appendChild(div);
}

// 14. إرسال رسالة
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value;
    
    if (text.trim() === '' || !currentChatId) return;

    messageInput.value = ''; // إفراغ الحقل فوراً

    try {
        await db.collection('chats').doc(currentChatId).collection('messages').add({
            text: text,
            senderId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("خطأ في إرسال الرسالة: ", error);
        messageInput.value = text; // أعد النص إذا فشل الإرسال
    }
});