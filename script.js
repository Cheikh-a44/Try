import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===================================================
   استبدل القيم التالية بقيمك من Firebase Console
   =================================================== */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAZ5yrN0sp092UXeR9ykRkIw3A3WBYMaiw",
  authDomain: "debt-book-c385d.firebaseapp.com",
  projectId: "debt-book-c385d",
  storageBucket: "debt-book-c385d.firebasestorage.app",
  messagingSenderId: "1002736415285",
  appId: "1:1002736415285:web:9896e324499a369be0f77c",
  measurementId: "G-HY1MLFGV8K",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PEOPLE_COL = "debt_people";
const ARCHIVE_COL = "debt_archive";

let people = [];
let archives = [];
let currentPersonId = null;
let currentUser = null;
let peopleUnsub = null;
let archiveUnsub = null;

/* ======================
   أدوات مساعدة
   ====================== */
function switchScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function openModal(id) {
  document.getElementById(id).classList.add("active");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("fr-FR");
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return (
    d.toLocaleDateString("fr-FR") +
    " - " +
    d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

function authErrorMsg(code) {
  const map = {
    "auth/email-already-in-use": "البريد الإلكتروني مستخدم بالفعل",
    "auth/invalid-email": "البريد الإلكتروني غير صالح",
    "auth/weak-password": "كلمة السر ضعيفة (6 أحرف على الأقل)",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد",
    "auth/wrong-password": "كلمة السر غير صحيحة",
    "auth/invalid-credential": "البريد أو كلمة السر غير صحيحة",
    "auth/too-many-requests": "محاولات كثيرة، حاول لاحقاً",
    "auth/network-request-failed": "تعذر الاتصال بالإنترنت",
    "auth/missing-password": "أدخل كلمة السر",
  };
  return map[code] || "حدث خطأ، حاول مرة أخرى";
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

/* ======================
   شاشة الدخول
   ====================== */
document.getElementById("loginTabBtn").onclick = () => {
  document.getElementById("loginTabBtn").classList.add("active");
  document.getElementById("signupTabBtn").classList.remove("active");
  document.getElementById("loginForm").classList.add("active");
  document.getElementById("signupForm").classList.remove("active");
};

document.getElementById("signupTabBtn").onclick = () => {
  document.getElementById("signupTabBtn").classList.add("active");
  document.getElementById("loginTabBtn").classList.remove("active");
  document.getElementById("signupForm").classList.add("active");
  document.getElementById("loginForm").classList.remove("active");
};

document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";

  if (!email || !password) {
    errEl.textContent = "أدخل البريد وكلمة السر";
    return;
  }

  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  btn.textContent = "جاري الدخول...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    errEl.textContent = authErrorMsg(e.code);
  } finally {
    btn.disabled = false;
    btn.textContent = "دخول";
  }
};

document.getElementById("signupBtn").onclick = async () => {
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const pass1 = document.getElementById("signupPassword").value;
  const pass2 = document.getElementById("signupPassword2").value;
  const errEl = document.getElementById("signupError");
  errEl.textContent = "";

  if (!name) return (errEl.textContent = "أدخل الاسم");
  if (!email) return (errEl.textContent = "أدخل البريد الإلكتروني");
  if (pass1.length < 6)
    return (errEl.textContent = "كلمة السر يجب أن تكون 6 أحرف على الأقل");
  if (pass1 !== pass2) return (errEl.textContent = "كلمتا السر غير متطابقتين");

  const btn = document.getElementById("signupBtn");
  btn.disabled = true;
  btn.textContent = "جاري التسجيل...";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass1);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    errEl.textContent = authErrorMsg(e.code);
  } finally {
    btn.disabled = false;
    btn.textContent = "تسجيل";
  }
};

document.getElementById("logoutBtn").onclick = async () => {
  if (confirm("تسجيل الخروج؟")) {
    await signOut(auth);
  }
};

/* ======================
   مراقبة حالة الدخول
   ====================== */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  document.getElementById("loadingScreen").classList.add("hidden");

  if (user) {
    switchScreen("homeScreen");
    startDataListeners(user.uid);
  } else {
    stopDataListeners();
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
    document.getElementById("signupName").value = "";
    document.getElementById("signupEmail").value = "";
    document.getElementById("signupPassword").value = "";
    document.getElementById("signupPassword2").value = "";
    document.getElementById("loginError").textContent = "";
    document.getElementById("signupError").textContent = "";
    switchScreen("authScreen");
  }
});

/* ======================
   مستمعو البيانات
   ====================== */
function startDataListeners(uid) {
  stopDataListeners();

  const qPeople = query(
    collection(db, PEOPLE_COL),
    where("ownerId", "==", uid),
  );
  peopleUnsub = onSnapshot(
    qPeople,
    (snapshot) => {
      people = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      people.sort((a, b) => a.createdAt - b.createdAt);
      renderPeople(document.getElementById("searchInput").value || "");
      if (currentPersonId) renderDebts();
    },
    (err) => console.error("خطأ في تحميل الأشخاص:", err),
  );

  const qArch = query(collection(db, ARCHIVE_COL), where("ownerId", "==", uid));
  archiveUnsub = onSnapshot(
    qArch,
    (snapshot) => {
      archives = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      archives.sort((a, b) => b.archivedAt - a.archivedAt);
      renderArchive();
    },
    (err) => console.error("خطأ في تحميل الأرشيف:", err),
  );
}

function stopDataListeners() {
  if (peopleUnsub) {
    peopleUnsub();
    peopleUnsub = null;
  }
  if (archiveUnsub) {
    archiveUnsub();
    archiveUnsub = null;
  }
  people = [];
  archives = [];
  currentPersonId = null;
}

/* ======================
   عرض الأشخاص
   ====================== */
function renderPeople(filter = "") {
  const list = document.getElementById("peopleList");
  if (!list) return;
  list.innerHTML = "";

  const filtered = people.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()),
  );

  if (filtered.length === 0) {
    list.innerHTML =
      '<p style="text-align:center;color:#888;padding:20px;">لا يوجد أشخاص</p>';
    return;
  }

  filtered.forEach((person) => {
    const card = document.createElement("div");
    card.className = "person-card";

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = person.name;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-person";
    delBtn.textContent = "حذف";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(`حذف "${person.name}" نهائياً؟`)) {
        await deleteDoc(doc(db, PEOPLE_COL, person.id));
      }
    };

    card.appendChild(nameEl);
    card.appendChild(delBtn);
    card.onclick = () => openPerson(person.id);
    list.appendChild(card);
  });
}

/* ======================
   شاشة الشخص
   ====================== */
function openPerson(id) {
  currentPersonId = id;
  const person = people.find((p) => p.id === id);
  if (!person) return;
  document.getElementById("personName").textContent = person.name;
  renderDebts();
  switchScreen("personScreen");
}

function renderDebts() {
  const person = people.find((p) => p.id === currentPersonId);
  if (!person) return;
  const list = document.getElementById("debtList");
  list.innerHTML = "";

  if (!person.activeDebts || person.activeDebts.length === 0) {
    list.innerHTML =
      '<p style="text-align:center;color:#888;padding:20px;">لا توجد ديون حالياً</p>';
    return;
  }

  person.activeDebts.forEach((d, index) => {
    const item = document.createElement("div");
    item.className = "debt-item" + (d.type === "trade" ? " trade" : "");

    const content = document.createElement("div");
    content.className = "debt-content";

    const desc = document.createElement("div");
    desc.className = "debt-desc";

    const date = document.createElement("div");
    date.className = "debt-date";
    date.textContent = formatDate(d.createdAt);

    if (d.type === "cash") {
      desc.textContent = `سيولة: ${d.amount}`;
    } else {
      if (d.name && d.name.trim()) {
        desc.textContent = `${d.name}: ${d.qty} × ${d.price}`;
      } else {
        desc.textContent = `${d.qty} × ${d.price}`;
      }
    }

    content.appendChild(desc);
    content.appendChild(date);

    const delBtn = document.createElement("button");
    delBtn.className = "delete-debt";
    delBtn.textContent = "حذف";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("حذف هذا الدين؟")) return;
      const updated = person.activeDebts.filter((_, i) => i !== index);
      await updateDoc(doc(db, PEOPLE_COL, currentPersonId), {
        activeDebts: updated,
      });
    };

    item.appendChild(content);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
}

/* ======================
   عرض الأرشيف
   ====================== */
function renderArchive() {
  const list = document.getElementById("archiveList");
  if (!list) return;
  list.innerHTML = "";

  if (archives.length === 0) {
    list.innerHTML =
      '<p style="text-align:center;color:#888;padding:20px;">الأرشيف فارغ</p>';
    return;
  }

  archives.forEach((arch) => {
    const card = document.createElement("div");
    card.className = "archive-card";

    const header = document.createElement("div");
    header.className = "archive-header";

    const name = document.createElement("div");
    name.className = "archive-name";
    name.textContent = arch.personName;

    const date = document.createElement("div");
    date.className = "archive-date";
    date.textContent = formatDate(arch.archivedAt);

    header.appendChild(name);
    header.appendChild(date);

    const total = document.createElement("div");
    total.className = "archive-total";
    total.textContent = "المجموع: " + arch.total;

    const details = document.createElement("div");
    details.className = "archive-details";
    details.textContent = buildPlainText(
      arch.personName,
      arch.items,
      arch.total,
      arch.archivedAt,
    );

    const actions = document.createElement("div");
    actions.className = "archive-actions";

    const viewBtn = document.createElement("button");
    viewBtn.className = "btn-view";
    viewBtn.textContent = "عرض";
    viewBtn.onclick = () => {
      document.getElementById("resultArea").innerHTML = buildResultHtml(
        arch.personName,
        arch.items,
        arch.total,
        arch.archivedAt,
      );
      openModal("resultModal");
    };

    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete-archive";
    delBtn.textContent = "حذف";
    delBtn.onclick = async () => {
      if (confirm("حذف هذا الحساب من الأرشيف؟")) {
        await deleteDoc(doc(db, ARCHIVE_COL, arch.id));
      }
    };

    actions.appendChild(viewBtn);
    actions.appendChild(delBtn);

    card.appendChild(header);
    card.appendChild(total);
    card.appendChild(details);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

/* ======================
   بناء نص الحساب
   ====================== */
function buildPlainText(personName, items, total, ts) {
  let text = `حساب: ${personName}\n`;
  text += formatDateTime(ts) + "\n";
  text += "--------------------\n";
  items.forEach((d, i) => {
    if (d.type === "cash") {
      text += `${i + 1}) سيولة: ${d.amount}\n`;
    } else {
      if (d.name && d.name.trim()) {
        text += `${i + 1}) ${d.name}: ${d.qty} × ${d.price} = ${d.qty * d.price}\n`;
      } else {
        text += `${i + 1}) ${d.qty} × ${d.price} = ${d.qty * d.price}\n`;
      }
    }
  });
  text += "--------------------\n";
  text += `المجموع: ${total}`;
  return text;
}

function buildResultHtml(personName, items, total, ts) {
  let html = `<span class="result-name">${escapeHtml(personName)}</span>`;
  html += `<span class="result-date">${formatDateTime(ts)}</span>`;

  items.forEach((d, i) => {
    if (d.type === "cash") {
      html += `<span class="item-line">${i + 1}) سيولة: ${d.amount}</span>`;
    } else {
      if (d.name && d.name.trim()) {
        html += `<span class="item-line">${i + 1}) ${escapeHtml(d.name)}: ${d.qty} × ${d.price} = ${d.qty * d.price}</span>`;
      } else {
        html += `<span class="item-line">${i + 1}) ${d.qty} × ${d.price} = ${d.qty * d.price}</span>`;
      }
    }
  });

  html += `<span class="result-total">المجموع: ${total}</span>`;
  return html;
}

/* ======================
   التنقل
   ====================== */
document.getElementById("searchInput").addEventListener("input", (e) => {
  renderPeople(e.target.value);
});

document.getElementById("addPersonBtn").onclick = () => {
  document.getElementById("newNameInput").value = "";
  openModal("nameModal");
};

document.getElementById("cancelName").onclick = () => closeModal("nameModal");

document.getElementById("confirmName").onclick = async () => {
  const name = document.getElementById("newNameInput").value.trim();
  if (!name) return alert("اكتب اسماً");

  await addDoc(collection(db, PEOPLE_COL), {
    name,
    ownerId: currentUser.uid,
    activeDebts: [],
    createdAt: Date.now(),
  });
  closeModal("nameModal");
};

document.getElementById("backBtn").onclick = () => {
  currentPersonId = null;
  switchScreen("homeScreen");
};

document.getElementById("archiveBtn").onclick = () => {
  renderArchive();
  switchScreen("archiveScreen");
};

document.getElementById("backFromArchive").onclick = () => {
  switchScreen("homeScreen");
};

/* ======================
   إضافة دين
   ====================== */
document.getElementById("addDebtBtn").onclick = () => openModal("typeModal");
document.getElementById("cancelType").onclick = () => closeModal("typeModal");

document.getElementById("cashBtn").onclick = () => {
  closeModal("typeModal");
  document.getElementById("cashAmount").value = "";
  openModal("cashModal");
};

document.getElementById("cancelCash").onclick = () => closeModal("cashModal");

document.getElementById("confirmCash").onclick = async () => {
  const amount = parseFloat(document.getElementById("cashAmount").value);
  if (!amount || amount <= 0) return alert("أدخل رقماً صحيحاً");

  const person = people.find((p) => p.id === currentPersonId);
  const newDebt = { type: "cash", amount, createdAt: Date.now() };
  const updated = [...(person.activeDebts || []), newDebt];

  await updateDoc(doc(db, PEOPLE_COL, currentPersonId), {
    activeDebts: updated,
  });
  closeModal("cashModal");
};

document.getElementById("tradeBtn").onclick = () => {
  closeModal("typeModal");
  document.getElementById("tradeName").value = "";
  document.getElementById("tradeQty").value = "";
  document.getElementById("tradePrice").value = "";
  openModal("tradeModal");
};

document.getElementById("cancelTrade").onclick = () => closeModal("tradeModal");

document.getElementById("confirmTrade").onclick = async () => {
  const name = document.getElementById("tradeName").value.trim();
  const qty = parseFloat(document.getElementById("tradeQty").value);
  const price = parseFloat(document.getElementById("tradePrice").value);

  if (!qty || !price || qty <= 0 || price <= 0)
    return alert("أدخل قيماً صحيحة");

  const person = people.find((p) => p.id === currentPersonId);
  const newDebt = { type: "trade", name, qty, price, createdAt: Date.now() };
  const updated = [...(person.activeDebts || []), newDebt];

  await updateDoc(doc(db, PEOPLE_COL, currentPersonId), {
    activeDebts: updated,
  });
  closeModal("tradeModal");
};

/* ======================
   حساب الجميع
   ====================== */
document.getElementById("calcBtn").onclick = async () => {
  const person = people.find((p) => p.id === currentPersonId);
  if (!person || !person.activeDebts || person.activeDebts.length === 0) {
    return alert("لا توجد ديون لحسابها");
  }

  let total = 0;
  const now = Date.now();

  person.activeDebts.forEach((d) => {
    if (d.type === "cash") {
      total += d.amount;
    } else {
      total += d.qty * d.price;
    }
  });

  await addDoc(collection(db, ARCHIVE_COL), {
    personName: person.name,
    items: person.activeDebts,
    total,
    archivedAt: now,
    ownerId: currentUser.uid,
  });

  await updateDoc(doc(db, PEOPLE_COL, currentPersonId), { activeDebts: [] });

  document.getElementById("resultArea").innerHTML = buildResultHtml(
    person.name,
    person.activeDebts,
    total,
    now,
  );
  openModal("resultModal");
};

document.getElementById("closeResult").onclick = () =>
  closeModal("resultModal");

document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.remove("active");
  });
});