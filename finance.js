import {
  collection, doc, addDoc, updateDoc, setDoc, getDoc,
  onSnapshot, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

var FEE_CATEGORY_ID = 'fee';

function randomCategoryId() {
  return 'cat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function subscribeFinanceCategories(db, onData, onError) {
  return onSnapshot(doc(db, 'settings', 'financeCategories'), function (snap) {
    var categories = (snap.exists() && Array.isArray(snap.data().categories)) ? snap.data().categories : [];
    onData(categories);
  }, onError);
}

export async function ensureDefaultFeeCategory(db) {
  var ref = doc(db, 'settings', 'financeCategories');
  var snap = await getDoc(ref);
  var categories = (snap.exists() && Array.isArray(snap.data().categories)) ? snap.data().categories : [];
  var hasFee = categories.some(function (c) { return c.id === FEE_CATEGORY_ID; });
  if (hasFee) return categories;
  var updated = categories.concat([{ id: FEE_CATEGORY_ID, label: '團費/社費', type: 'income', order: -1, protected: true }]);
  await setDoc(ref, { categories: updated }, { merge: true });
  return updated;
}

export async function addFinanceCategory(db, label, type) {
  var ref = doc(db, 'settings', 'financeCategories');
  var snap = await getDoc(ref);
  var categories = (snap.exists() && Array.isArray(snap.data().categories)) ? snap.data().categories : [];
  var newCategory = { id: randomCategoryId(), label: label, type: type, order: categories.length, protected: false };
  var updated = categories.concat([newCategory]);
  await setDoc(ref, { categories: updated }, { merge: true });
  return newCategory.id;
}

export async function updateFinanceCategory(db, categoryId, updates) {
  var ref = doc(db, 'settings', 'financeCategories');
  var snap = await getDoc(ref);
  var categories = (snap.exists() && Array.isArray(snap.data().categories)) ? snap.data().categories : [];
  var target = categories.filter(function (c) { return c.id === categoryId; })[0];
  if (!target) {
    var notFoundErr = new Error('找不到這個分類');
    notFoundErr.code = 'category-not-found';
    throw notFoundErr;
  }
  if (target.protected && updates.type !== undefined && updates.type !== target.type) {
    var lockedErr = new Error('這是保留分類，不能改變收入/支出類型');
    lockedErr.code = 'protected-category-type-locked';
    throw lockedErr;
  }
  var next = categories.map(function (c) {
    if (c.id !== categoryId) return c;
    var merged = Object.assign({}, c);
    if (updates.label !== undefined) merged.label = updates.label;
    if (updates.type !== undefined && !c.protected) merged.type = updates.type;
    return merged;
  });
  await setDoc(ref, { categories: next }, { merge: true });
}

export async function deleteFinanceCategory(db, categoryId) {
  var ref = doc(db, 'settings', 'financeCategories');
  var snap = await getDoc(ref);
  var categories = (snap.exists() && Array.isArray(snap.data().categories)) ? snap.data().categories : [];
  var target = categories.filter(function (c) { return c.id === categoryId; })[0];
  if (target && target.protected) {
    var err = new Error('這是保留分類，不能刪除');
    err.code = 'protected-category-cannot-delete';
    throw err;
  }
  var next = categories.filter(function (c) { return c.id !== categoryId; });
  await setDoc(ref, { categories: next }, { merge: true });
}

// 已存匯款帳戶（校內團／校友團等可能各自不同帳戶），建立/編輯應繳項目時可以套用。
// bank/account/holder/note 文字欄位套用當下複製進那筆 feeDues 文件（快照，帳戶庫之後
// 異動不會回頭影響已經套用過的項目），但 QR Code 圖片刻意不複製——feeDues 只存
// remittanceAccountId 參照，畫面上永遠即時去帳戶庫查目前最新的 QR Code（使用者定案：
// 換一張乾淨的 QR 圖不用回頭改所有歷史項目）
export function subscribeRemittanceAccounts(db, onData, onError) {
  return onSnapshot(doc(db, 'settings', 'financeRemittanceAccounts'), function (snap) {
    var accounts = (snap.exists() && Array.isArray(snap.data().accounts)) ? snap.data().accounts : [];
    onData(accounts);
  }, onError);
}

export async function addRemittanceAccount(db, fields) {
  var ref = doc(db, 'settings', 'financeRemittanceAccounts');
  var snap = await getDoc(ref);
  var accounts = (snap.exists() && Array.isArray(snap.data().accounts)) ? snap.data().accounts : [];
  var newAccount = {
    id: 'acct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    label: fields.label, bank: fields.bank, account: fields.account, holder: fields.holder,
    qrCodeDataUrl: fields.qrCodeDataUrl || null
  };
  await setDoc(ref, { accounts: accounts.concat([newAccount]) }, { merge: true });
  return newAccount.id;
}

export async function updateRemittanceAccount(db, accountId, fields) {
  var ref = doc(db, 'settings', 'financeRemittanceAccounts');
  var snap = await getDoc(ref);
  var accounts = (snap.exists() && Array.isArray(snap.data().accounts)) ? snap.data().accounts : [];
  var next = accounts.map(function (a) {
    if (a.id !== accountId) return a;
    return {
      id: a.id, label: fields.label, bank: fields.bank, account: fields.account, holder: fields.holder,
      qrCodeDataUrl: fields.qrCodeDataUrl !== undefined ? fields.qrCodeDataUrl : (a.qrCodeDataUrl || null)
    };
  });
  await setDoc(ref, { accounts: next }, { merge: true });
}

export async function deleteRemittanceAccount(db, accountId) {
  var ref = doc(db, 'settings', 'financeRemittanceAccounts');
  var snap = await getDoc(ref);
  var accounts = (snap.exists() && Array.isArray(snap.data().accounts)) ? snap.data().accounts : [];
  var next = accounts.filter(function (a) { return a.id !== accountId; });
  await setDoc(ref, { accounts: next }, { merge: true });
}

export function subscribeFinanceSettings(db, onData, onError) {
  return onSnapshot(doc(db, 'settings', 'financeSettings'), function (snap) {
    onData(snap.exists() ? snap.data() : { openingBalance: 0 });
  }, onError);
}

export async function updateOpeningBalance(db, uid, amount) {
  await setDoc(doc(db, 'settings', 'financeSettings'), {
    openingBalance: amount,
    openingBalanceUpdatedAt: serverTimestamp(),
    openingBalanceUpdatedBy: uid
  }, { merge: true });
}

export function subscribeLedgerEntries(db, onData, onError) {
  return onSnapshot(collection(db, 'ledgerEntries'), function (snap) {
    var list = [];
    snap.forEach(function (docSnap) {
      list.push(Object.assign({ id: docSnap.id }, docSnap.data()));
    });
    list.sort(function (a, b) {
      var ta = a.date && a.date.toMillis ? a.date.toMillis() : 0;
      var tb = b.date && b.date.toMillis ? b.date.toMillis() : 0;
      return tb - ta;
    });
    onData(list);
  }, onError);
}

export async function addLedgerEntry(db, uid, fields) {
  await addDoc(collection(db, 'ledgerEntries'), {
    type: fields.type,
    categoryId: fields.categoryId,
    amount: fields.amount,
    date: fields.date,
    note: fields.note || '',
    recordedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    linkedFeePaymentId: null,
    voided: false
  });
}

export async function updateLedgerEntry(db, entryId, fields) {
  await updateDoc(doc(db, 'ledgerEntries', entryId), {
    type: fields.type,
    categoryId: fields.categoryId,
    amount: fields.amount,
    date: fields.date,
    note: fields.note || '',
    updatedAt: serverTimestamp()
  });
}

export async function voidLedgerEntry(db, entryId, uid) {
  await updateDoc(doc(db, 'ledgerEntries', entryId), {
    voided: true,
    voidedAt: serverTimestamp(),
    voidedBy: uid
  });
}

export function computeBalance(openingBalance, entries) {
  var total = openingBalance || 0;
  entries.forEach(function (e) {
    if (e.voided) return;
    total += e.type === 'income' ? e.amount : -e.amount;
  });
  return total;
}

export function subscribeFeeDues(db, onData, onError) {
  return onSnapshot(collection(db, 'feeDues'), function (snap) {
    var list = [];
    snap.forEach(function (docSnap) {
      list.push(Object.assign({ id: docSnap.id }, docSnap.data()));
    });
    list.sort(function (a, b) {
      var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    onData(list);
  }, onError);
}

export async function addFeeDue(db, uid, fields) {
  var ref = await addDoc(collection(db, 'feeDues'), {
    title: fields.title,
    amount: fields.amount,
    memberIds: fields.memberIds,
    memberOverrides: fields.memberOverrides || {},
    sourceTemplateId: fields.sourceTemplateId || null,
    remittanceBank: fields.remittanceBank || '',
    remittanceAccount: fields.remittanceAccount || '',
    remittanceHolder: fields.remittanceHolder || '',
    remittanceNote: fields.remittanceNote || '',
    remittanceAccountId: fields.remittanceAccountId || null,
    createdAt: serverTimestamp(),
    createdBy: uid,
    voided: false
  });
  return ref.id;
}

export async function updateFeeDue(db, dueId, uid, fields) {
  await updateDoc(doc(db, 'feeDues', dueId), {
    title: fields.title,
    amount: fields.amount,
    memberIds: fields.memberIds,
    memberOverrides: fields.memberOverrides || {},
    remittanceBank: fields.remittanceBank || '',
    remittanceAccount: fields.remittanceAccount || '',
    remittanceHolder: fields.remittanceHolder || '',
    remittanceNote: fields.remittanceNote || '',
    remittanceAccountId: fields.remittanceAccountId || null,
    updatedAt: serverTimestamp(),
    updatedBy: uid
  });
}

export async function voidFeeDue(db, dueId, uid) {
  await updateDoc(doc(db, 'feeDues', dueId), {
    voided: true,
    voidedAt: serverTimestamp(),
    voidedBy: uid
  });
}

export function subscribeFeePayments(db, onData, onError) {
  return onSnapshot(collection(db, 'feePayments'), function (snap) {
    var list = [];
    snap.forEach(function (docSnap) {
      list.push(Object.assign({ id: docSnap.id }, docSnap.data()));
    });
    onData(list);
  }, onError);
}

export async function recordFeePayment(db, fields) {
  var paymentRef = doc(db, 'feePayments', fields.dueId + '_' + fields.uid);
  var ledgerRef = doc(collection(db, 'ledgerEntries'));
  var batch = writeBatch(db);
  batch.set(paymentRef, {
    dueId: fields.dueId,
    uid: fields.uid,
    amountDue: fields.amountDue,
    amountPaid: fields.amountPaid,
    paidAt: fields.paidAt,
    method: fields.method || null,
    note: fields.note || '',
    recordedBy: fields.recordedBy,
    createdAt: serverTimestamp(),
    linkedLedgerEntryId: ledgerRef.id,
    voided: false
  });
  batch.set(ledgerRef, {
    type: 'income',
    categoryId: 'fee',
    amount: fields.amountPaid,
    date: fields.paidAt,
    note: fields.note || '',
    recordedBy: fields.recordedBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    linkedFeePaymentId: paymentRef.id,
    voided: false
  });
  await batch.commit();
}

export async function updateFeePayment(db, dueId, uid, fields) {
  var paymentRef = doc(db, 'feePayments', dueId + '_' + uid);
  var paymentSnap = await getDoc(paymentRef);
  if (!paymentSnap.exists()) {
    var err = new Error('找不到這筆繳費紀錄');
    err.code = 'payment-not-found';
    throw err;
  }
  var payment = paymentSnap.data();
  var batch = writeBatch(db);
  batch.update(paymentRef, {
    amountPaid: fields.amountPaid,
    paidAt: fields.paidAt,
    method: fields.method || null,
    note: fields.note || ''
  });
  batch.update(doc(db, 'ledgerEntries', payment.linkedLedgerEntryId), {
    amount: fields.amountPaid,
    date: fields.paidAt,
    note: fields.note || '',
    updatedAt: serverTimestamp()
  });
  await batch.commit();
}

export async function voidFeePayment(db, dueId, uid, voidedBy) {
  var paymentRef = doc(db, 'feePayments', dueId + '_' + uid);
  var paymentSnap = await getDoc(paymentRef);
  if (!paymentSnap.exists()) {
    var err = new Error('找不到這筆繳費紀錄');
    err.code = 'payment-not-found';
    throw err;
  }
  var payment = paymentSnap.data();
  var batch = writeBatch(db);
  batch.update(paymentRef, { voided: true, voidedAt: serverTimestamp(), voidedBy: voidedBy });
  batch.update(doc(db, 'ledgerEntries', payment.linkedLedgerEntryId), { voided: true, voidedAt: serverTimestamp(), voidedBy: voidedBy });
  await batch.commit();
}
