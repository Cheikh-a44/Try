/* ======================
   هيكل البيانات
   ======================
   people = [
     {
       id: "unique",
       name: "أحمد",
       activeDebts: [
         { type: "cash", amount: 500 },
         { type: "trade", qty: 10, price: 25 }
       ],
       history: [
         { 
           date: "...", 
           items: [...],
           total: 750
         }
       ]
     }
   ]
*/

let people = JSON.parse(localStorage.getItem('debt_people') || '[]');
let currentPersonId = null;

/* ======================
   حفظ البيانات
   ====================== */
function save() {
  localStorage.setItem('debt_people', JSON.stringify(people));
}

/* ======================
   عرض الشاشة الرئيسية
   ====================== */
function renderPeople(filter = '') {
  const list = document.getElementById('peopleList');
  list.innerHTML = '';

  const filtered = people.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">لا يوجد أشخاص</p>';
    return;
  }

  filtered.forEach(person => {
    const card = document.createElement('div');
    card.className = 'person-card';

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = person.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-person';
    delBtn.textContent = 'حذف';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`حذف "${person.name}" نهائياً؟`)) {
        people = people.filter(p => p.id !== person.id);
        save();
        renderPeople(document.getElementById('searchInput').value);
      }
    };

    card.appendChild(nameEl);
    card.appendChild(delBtn);
    card.onclick = () => openPerson(person.id);
    list.appendChild(card);
  });
}

/* ======================
   فتح شاشة شخص
   ====================== */
function openPerson(id) {
  currentPersonId = id;
  const person = people.find(p => p.id === id);
  if (!person) return;

  document.getElementById('personName').textContent = person.name;
  renderDebts();
  switchScreen('personScreen');
}

/* ======================
   عرض ديون الشخص
   ====================== */
function renderDebts() {
  const person = people.find(p => p.id === currentPersonId);
  const list = document.getElementById('debtList');
  list.innerHTML = '';

  if (person.activeDebts.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">لا توجد ديون حالياً</p>';
    return;
  }

  person.activeDebts.forEach(d => {
    const item = document.createElement('div');
    item.className = 'debt-item' + (d.type === 'trade' ? ' trade' : '');

    const desc = document.createElement('div');
    desc.className = 'debt-desc';

    const detail = document.createElement('div');
    detail.className = 'debt-detail';

    if (d.type === 'cash') {
      desc.textContent = `💵 سيولة: ${d.amount}`;
      detail.textContent = 'دين نقدي';
    } else {
      desc.textContent = `📦 تجارة: ${d.qty} × ${d.price}`;
      detail.textContent = `(لن يُحسب تلقائياً - يُحسب عند الحساب)`;
    }

    item.appendChild(desc);
    item.appendChild(detail);
    list.appendChild(item);
  });
}

/* ======================
   التنقل بين الشاشات
   ====================== */
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ======================
   النوافذ
   ====================== */
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

/* ======================
   الأحداث
   ====================== */

// البحث
document.getElementById('searchInput').addEventListener('input', (e) => {
  renderPeople(e.target.value);
});

// زر إضافة شخص
document.getElementById('addPersonBtn').onclick = () => {
  document.getElementById('newNameInput').value = '';
  openModal('nameModal');
};

document.getElementById('cancelName').onclick = () => closeModal('nameModal');

document.getElementById('confirmName').onclick = () => {
  const name = document.getElementById('newNameInput').value.trim();
  if (!name) return alert('اكتب اسماً');

  const person = {
    id: Date.now().toString(),
    name,
    activeDebts: [],
    history: []
  };
  people.push(person);
  save();
  closeModal('nameModal');
  renderPeople(document.getElementById('searchInput').value);
};

// الرجوع
document.getElementById('backBtn').onclick = () => {
  currentPersonId = null;
  switchScreen('homeScreen');
  renderPeople(document.getElementById('searchInput').value);
};

// زر إضافة دين
document.getElementById('addDebtBtn').onclick = () => openModal('typeModal');
document.getElementById('cancelType').onclick = () => closeModal('typeModal');

// اختيار سيولة
document.getElementById('cashBtn').onclick = () => {
  closeModal('typeModal');
  document.getElementById('cashAmount').value = '';
  openModal('cashModal');
};

document.getElementById('cancelCash').onclick = () => closeModal('cashModal');

document.getElementById('confirmCash').onclick = () => {
  const amount = parseFloat(document.getElementById('cashAmount').value);
  if (!amount || amount <= 0) return alert('أدخل رقماً صحيحاً');

  const person = people.find(p => p.id === currentPersonId);
  person.activeDebts.push({ type: 'cash', amount });
  save();
  closeModal('cashModal');
  renderDebts();
};

// اختيار تجارة
document.getElementById('tradeBtn').onclick = () => {
  closeModal('typeModal');
  document.getElementById('tradeQty').value = '';
  document.getElementById('tradePrice').value = '';
  openModal('tradeModal');
};

document.getElementById('cancelTrade').onclick = () => closeModal('tradeModal');

document.getElementById('confirmTrade').onclick = () => {
  const qty = parseFloat(document.getElementById('tradeQty').value);
  const price = parseFloat(document.getElementById('tradePrice').value);
  if (!qty || !price || qty <= 0 || price <= 0) return alert('أدخل قيماً صحيحة');

  const person = people.find(p => p.id === currentPersonId);
  person.activeDebts.push({ type: 'trade', qty, price });
  save();
  closeModal('tradeModal');
  renderDebts();
};

/* ======================
   زر حساب الجميع
   ====================== */
document.getElementById('calcBtn').onclick = () => {
  const person = people.find(p => p.id === currentPersonId);
  if (person.activeDebts.length === 0) {
    return alert('لا توجد ديون لحسابها');
  }

  let total = 0;
  let text = `📋 حساب: ${person.name}\n`;
  text += `📅 ${new Date().toLocaleDateString('ar-EG')}\n`;
  text += '━━━━━━━━━━━━━━━━\n';

  person.activeDebts.forEach((d, i) => {
    if (d.type === 'cash') {
      total += d.amount;
      text += `${i + 1}) 💵 سيولة: ${d.amount}\n`;
    } else {
      const sub = d.qty * d.price;
      total += sub;
      text += `${i + 1}) 📦 تجارة: ${d.qty} × ${d.price} = ${sub}\n`;
    }
  });

  text += '━━━━━━━━━━━━━━━━\n';
  text += `💰 المجموع الكلي: ${total}\n`;

  // حفظ في السجل ونقل الديون للماضي
  person.history.push({
    date: new Date().toISOString(),
    items: [...person.activeDebts],
    total
  });
  person.activeDebts = [];
  save();
  renderDebts();

  // عرض النتيجة
  const resultArea = document.getElementById('resultArea');
  resultArea.textContent = text;
  openModal('resultModal');
};

document.getElementById('closeResult').onclick = () => closeModal('resultModal');

// إغلاق النوافذ عند الضغط على الخلفية
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', (e) => {
    if (e.target === m) m.classList.remove('active');
  });
});

/* ======================
   التشغيل الأولي
   ====================== */
renderPeople();