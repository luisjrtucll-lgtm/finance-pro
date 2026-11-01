import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import Database from 'better-sqlite3';
import { pathToFileURL } from 'url';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'finance-pro-secret';

const databaseDir = path.join(process.cwd(), 'data');
fs.mkdirSync(databaseDir, { recursive: true });

const databasePath = process.env.DATABASE_PATH || path.join(databaseDir, 'finance-pro.db');
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');

const run = (sql, params = []) => db.prepare(sql).run(...params);
const get = (sql, params = []) => db.prepare(sql).get(...params);
const all = (sql, params = []) => db.prepare(sql).all(...params);
const toNumber = (value) => Number(value || 0);
const nowIso = () => new Date().toISOString();

const createTables = () => {
  run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'bank',
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      icon TEXT NOT NULL DEFAULT 'bank',
      color TEXT NOT NULL DEFAULT '#6fe3ff',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      related_account_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY(related_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      month TEXT NOT NULL,
      limit_amount REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#6fe3ff',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL DEFAULT 0,
      current_amount REAL NOT NULL DEFAULT 0,
      deadline TEXT,
      color TEXT NOT NULL DEFAULT '#3dd598',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      monthly_payment REAL NOT NULL DEFAULT 0,
      due_day INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'em_andamento',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      limit_amount REAL NOT NULL DEFAULT 0,
      used_amount REAL NOT NULL DEFAULT 0,
      due_day INTEGER NOT NULL DEFAULT 10,
      closing_day INTEGER NOT NULL DEFAULT 5,
      color TEXT NOT NULL DEFAULT '#5da8ff',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Renda fixa',
      value REAL NOT NULL DEFAULT 0,
      monthly_contribution REAL NOT NULL DEFAULT 0,
      performance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'expense',
      frequency TEXT NOT NULL DEFAULT 'mensal',
      next_date TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      currency TEXT NOT NULL DEFAULT 'EUR',
      theme TEXT NOT NULL DEFAULT 'dark',
      monthly_income_goal REAL NOT NULL DEFAULT 0,
      emergency_fund_target REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
};

createTables();

const getUserFromToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso ausente.' });
  }

  const payload = getUserFromToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  const user = get('SELECT id, name, email, created_at FROM users WHERE id = ?', [payload.sub]);
  if (!user) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }

  req.user = user;
  return next();
};

const ensureUserSettings = (userId) => {
  const existing = get('SELECT * FROM settings WHERE user_id = ?', [userId]);
  if (existing) {
    return existing;
  }

  run(
    `INSERT INTO settings (user_id, currency, theme, monthly_income_goal, emergency_fund_target, updated_at)
     VALUES (?, 'EUR', 'dark', 0, 0, ?)`,
    [userId, nowIso()]
  );

  return get('SELECT * FROM settings WHERE user_id = ?', [userId]);
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  created_at: user.created_at,
});

const currencyFormat = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0));

const calculateDashboard = (userId) => {
  const accounts = all('SELECT * FROM accounts WHERE user_id = ? ORDER BY id DESC', [userId]);
  const transactions = all(
    `SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 50`,
    [userId]
  );
  const budgets = all('SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC, id DESC', [userId]);
  const goals = all('SELECT * FROM goals WHERE user_id = ? ORDER BY deadline ASC, id DESC', [userId]);
  const debts = all('SELECT * FROM debts WHERE user_id = ? ORDER BY due_day ASC, id DESC', [userId]);
  const cards = all('SELECT * FROM cards WHERE user_id = ? ORDER BY id DESC', [userId]);
  const investments = all('SELECT * FROM investments WHERE user_id = ? ORDER BY id DESC', [userId]);
  const recurring = all('SELECT * FROM recurring WHERE user_id = ? ORDER BY next_date ASC, id DESC', [userId]);
  const settings = ensureUserSettings(userId);

  const totalBalance = accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
  const totalIncome = transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const totalExpense = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);

  const monthlySavings = totalIncome - totalExpense;
  const projectedBalance = totalBalance + monthlySavings;
  const upcomingBills = recurring.filter((item) => item.active === 1).length + debts.filter((debt) => debt.status !== 'quitada').length;

  const insights = [
    {
      type: 'positive',
      title: 'Fluxo de caixa',
      description: monthlySavings >= 0
        ? `Você está gerando ${currencyFormat(monthlySavings)} líquidos por mês.`
        : `Seu fluxo mensal está negativo em ${currencyFormat(Math.abs(monthlySavings))}.`,
    },
    {
      type: 'neutral',
      title: 'Reserva de emergência',
      description: totalBalance > 0
        ? `Seu saldo atual cobre ${currencyFormat(totalBalance)} em disponibilidades.`
        : 'Cadastre contas para monitorar seu patrimônio.',
    },
    {
      type: 'warning',
      title: 'Dívidas e compromissos',
      description: debts.length > 0
        ? `${debts.length} dívida(s) cadastrada(s) ainda exigem atenção.`
        : 'Nenhuma dívida registrada. Continue assim.',
    },
  ];

  return {
    dashboard: {
      totalBalance,
      totalIncome,
      totalExpense,
      netWorth: totalBalance,
      monthlySavings,
      projectedBalance,
      upcomingBills,
      insights,
    },
    accounts: accounts.map((account) => ({ ...account, balance: toNumber(account.balance) })),
    transactions: transactions.map((transaction) => ({
      ...transaction,
      amount: toNumber(transaction.amount),
      related_account_id: transaction.related_account_id || null,
    })),
    budgets: budgets.map((budget) => ({
      ...budget,
      limit_amount: toNumber(budget.limit_amount),
      spent: toNumber(budget.spent),
    })),
    goals: goals.map((goal) => ({
      ...goal,
      target_amount: toNumber(goal.target_amount),
      current_amount: toNumber(goal.current_amount),
    })),
    debts: debts.map((debt) => ({
      ...debt,
      balance: toNumber(debt.balance),
      monthly_payment: toNumber(debt.monthly_payment),
      rate: toNumber(debt.rate),
    })),
    cards: cards.map((card) => ({
      ...card,
      limit_amount: toNumber(card.limit_amount),
      used_amount: toNumber(card.used_amount),
    })),
    investments: investments.map((investment) => ({
      ...investment,
      value: toNumber(investment.value),
      monthly_contribution: toNumber(investment.monthly_contribution),
      performance: toNumber(investment.performance),
    })),
    recurring: recurring.map((item) => ({
      ...item,
      amount: toNumber(item.amount),
      active: Boolean(item.active),
    })),
    settings: {
      id: settings.id,
      currency: settings.currency,
      theme: settings.theme,
      monthly_income_goal: toNumber(settings.monthly_income_goal),
      emergency_fund_target: toNumber(settings.emergency_fund_target),
    },
  };
};

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: databasePath, time: nowIso() });
});

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existingUser) {
    return res.status(409).json({ error: 'E-mail já cadastrado.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [
    String(name).trim(),
    normalizedEmail,
    passwordHash,
  ]);

  const user = get('SELECT id, name, email, created_at FROM users WHERE id = ?', [result.lastInsertRowid]);
  ensureUserSettings(user.id);

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });

  return res.status(201).json({
    token,
    user: sanitizeUser(user),
  });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const user = get('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({
    token,
    user: sanitizeUser(user),
  });
});

app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Informe o e-mail para recuperar a senha.' });
  }

  const user = get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (!user) {
    return res.json({
      message: 'Se o e-mail estiver cadastrado, enviaremos instruções de recuperação.',
    });
  }

  return res.json({
    message: 'Se o e-mail estiver cadastrado, enviaremos instruções de recuperação.',
  });
});

app.get('/api/dashboard', authMiddleware, (req, res) => {
  const payload = calculateDashboard(req.user.id);
  return res.json(payload);
});

app.get('/api/accounts', authMiddleware, (req, res) => {
  const accounts = all('SELECT * FROM accounts WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  return res.json(accounts.map((account) => ({ ...account, balance: toNumber(account.balance) })));
});

app.get('/api/transactions', authMiddleware, (req, res) => {
  const transactions = all(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC',
    [req.user.id]
  );
  return res.json(transactions.map((transaction) => ({ ...transaction, amount: toNumber(transaction.amount) })));
});

app.get('/api/budgets', authMiddleware, (req, res) => {
  const budgets = all('SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC, id DESC', [req.user.id]);
  return res.json(budgets.map((budget) => ({ ...budget, limit_amount: toNumber(budget.limit_amount), spent: toNumber(budget.spent) })));
});

app.get('/api/goals', authMiddleware, (req, res) => {
  const goals = all('SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  return res.json(goals.map((goal) => ({ ...goal, target_amount: toNumber(goal.target_amount), current_amount: toNumber(goal.current_amount) })));
});

app.get('/api/debts', authMiddleware, (req, res) => {
  const debts = all('SELECT * FROM debts WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  return res.json(debts.map((debt) => ({ ...debt, balance: toNumber(debt.balance), rate: toNumber(debt.rate), monthly_payment: toNumber(debt.monthly_payment) })));
});

app.get('/api/cards', authMiddleware, (req, res) => {
  const cards = all('SELECT * FROM cards WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  return res.json(cards.map((card) => ({ ...card, limit_amount: toNumber(card.limit_amount), used_amount: toNumber(card.used_amount) })));
});

app.get('/api/investments', authMiddleware, (req, res) => {
  const investments = all('SELECT * FROM investments WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  return res.json(investments.map((investment) => ({
    ...investment,
    value: toNumber(investment.value),
    monthly_contribution: toNumber(investment.monthly_contribution),
    performance: toNumber(investment.performance),
  })));
});

app.get('/api/recurring', authMiddleware, (req, res) => {
  const recurring = all('SELECT * FROM recurring WHERE user_id = ? ORDER BY next_date ASC', [req.user.id]);
  return res.json(recurring.map((item) => ({ ...item, amount: toNumber(item.amount), active: Boolean(item.active) })));
});

app.get('/api/settings', authMiddleware, (req, res) => {
  const settings = ensureUserSettings(req.user.id);
  return res.json({
    id: settings.id,
    currency: settings.currency,
    theme: settings.theme,
    monthly_income_goal: toNumber(settings.monthly_income_goal),
    emergency_fund_target: toNumber(settings.emergency_fund_target),
  });
});

app.post('/api/accounts', authMiddleware, (req, res) => {
  const { name, type, balance, currency, icon, color } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'Nome da conta é obrigatório.' });
  }

  const result = run(
    `INSERT INTO accounts (user_id, name, type, balance, currency, icon, color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, String(name).trim(), type || 'bank', toNumber(balance), currency || 'EUR', icon || 'bank', color || '#6fe3ff']
  );

  const account = get('SELECT * FROM accounts WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({ ...account, balance: toNumber(account.balance) });
});

app.post('/api/transactions', authMiddleware, (req, res) => {
  const { accountId, relatedAccountId, type, category, description, amount, date, notes } = req.body || {};

  if (!accountId || !type || !description || !amount || !date) {
    return res.status(400).json({ error: 'Dados do lançamento incompletos.' });
  }

  const value = toNumber(amount);
  const account = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [Number(accountId), req.user.id]);
  if (!account) {
    return res.status(404).json({ error: 'Conta não encontrada.' });
  }

  if (type === 'income') {
    run('UPDATE accounts SET balance = balance + ? WHERE id = ?', [value, account.id]);
  }

  if (type === 'expense') {
    run('UPDATE accounts SET balance = balance - ? WHERE id = ?', [value, account.id]);
  }

  if (type === 'transfer') {
    const related = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [Number(relatedAccountId || 0), req.user.id]);
    if (!related) {
      return res.status(404).json({ error: 'Conta de destino não encontrada.' });
    }

    run('UPDATE accounts SET balance = balance - ? WHERE id = ?', [value, account.id]);
    run('UPDATE accounts SET balance = balance + ? WHERE id = ?', [value, related.id]);
  }

  const result = run(
    `INSERT INTO transactions (user_id, account_id, related_account_id, type, category, description, amount, date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      Number(accountId),
      relatedAccountId ? Number(relatedAccountId) : null,
      type,
      String(category || 'Geral').trim(),
      String(description).trim(),
      value,
      date,
      notes || '',
    ]
  );

  const transaction = get('SELECT * FROM transactions WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({ ...transaction, amount: toNumber(transaction.amount) });
});

app.put('/api/transactions/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const transaction = get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [id, req.user.id]);

  if (!transaction) {
    return res.status(404).json({ error: 'Lançamento não encontrado.' });
  }

  const { accountId, relatedAccountId, type, category, description, amount, date, notes } = req.body || {};
  const nextAmount = toNumber(amount ?? transaction.amount);

  run('UPDATE transactions SET account_id = ?, related_account_id = ?, type = ?, category = ?, description = ?, amount = ?, date = ?, notes = ? WHERE id = ?', [
    Number(accountId ?? transaction.account_id),
    relatedAccountId ? Number(relatedAccountId) : null,
    type || transaction.type,
    String(category || transaction.category).trim(),
    String(description || transaction.description).trim(),
    nextAmount,
    date || transaction.date,
    notes ?? transaction.notes,
    Number(id),
  ]);

  return res.json({ success: true });
});

app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const transaction = get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [id, req.user.id]);

  if (!transaction) {
    return res.status(404).json({ error: 'Lançamento não encontrado.' });
  }

  if (transaction.type === 'income') {
    run('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?', [toNumber(transaction.amount), transaction.account_id, req.user.id]);
  }

  if (transaction.type === 'expense') {
    run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?', [toNumber(transaction.amount), transaction.account_id, req.user.id]);
  }

  if (transaction.type === 'transfer' && transaction.related_account_id) {
    run('UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?', [toNumber(transaction.amount), transaction.account_id, req.user.id]);
    run('UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?', [toNumber(transaction.amount), transaction.related_account_id, req.user.id]);
  }

  run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, req.user.id]);
  return res.json({ success: true });
});

app.post('/api/budgets', authMiddleware, (req, res) => {
  const { category, month, limitAmount, color } = req.body || {};
  if (!category || !month) {
    return res.status(400).json({ error: 'Categoria e mês são obrigatórios.' });
  }

  const result = run(
    `INSERT INTO budgets (user_id, category, month, limit_amount, spent, color)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [req.user.id, String(category).trim(), month, toNumber(limitAmount), color || '#6fe3ff']
  );

  const budget = get('SELECT * FROM budgets WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({ ...budget, limit_amount: toNumber(budget.limit_amount), spent: toNumber(budget.spent) });
});

app.post('/api/goals', authMiddleware, (req, res) => {
  const { name, targetAmount, currentAmount, deadline, color } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Nome da meta é obrigatório.' });
  }

  const result = run(
    `INSERT INTO goals (user_id, name, target_amount, current_amount, deadline, color)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, String(name).trim(), toNumber(targetAmount), toNumber(currentAmount), deadline || null, color || '#3dd598']
  );

  const goal = get('SELECT * FROM goals WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({ ...goal, target_amount: toNumber(goal.target_amount), current_amount: toNumber(goal.current_amount) });
});

app.post('/api/debts', authMiddleware, (req, res) => {
  const { name, balance, rate, monthlyPayment, dueDay, status } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Nome da dívida é obrigatório.' });
  }

  const result = run(
    `INSERT INTO debts (user_id, name, balance, rate, monthly_payment, due_day, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, String(name).trim(), toNumber(balance), toNumber(rate), toNumber(monthlyPayment), Number(dueDay || 10), status || 'em_andamento']
  );

  const debt = get('SELECT * FROM debts WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({ ...debt, balance: toNumber(debt.balance), rate: toNumber(debt.rate), monthly_payment: toNumber(debt.monthly_payment) });
});

app.post('/api/cards', authMiddleware, (req, res) => {
  const { name, limitAmount, usedAmount, dueDay, closingDay, color } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Nome do cartão é obrigatório.' });
  }

  const result = run(
    `INSERT INTO cards (user_id, name, limit_amount, used_amount, due_day, closing_day, color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, String(name).trim(), toNumber(limitAmount), toNumber(usedAmount), Number(dueDay || 10), Number(closingDay || 5), color || '#5da8ff']
  );

  const card = get('SELECT * FROM cards WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({ ...card, limit_amount: toNumber(card.limit_amount), used_amount: toNumber(card.used_amount) });
});

app.post('/api/investments', authMiddleware, (req, res) => {
  const { name, type, value, monthlyContribution, performance } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Nome do investimento é obrigatório.' });
  }

  const result = run(
    `INSERT INTO investments (user_id, name, type, value, monthly_contribution, performance)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, String(name).trim(), type || 'Renda fixa', toNumber(value), toNumber(monthlyContribution), toNumber(performance)]
  );

  const investment = get('SELECT * FROM investments WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({
    ...investment,
    value: toNumber(investment.value),
    monthly_contribution: toNumber(investment.monthly_contribution),
    performance: toNumber(investment.performance),
  });
});

app.post('/api/recurring', authMiddleware, (req, res) => {
  const { title, category, amount, type, frequency, nextDate, active } = req.body || {};
  if (!title || !category) {
    return res.status(400).json({ error: 'Título e categoria são obrigatórios.' });
  }

  const result = run(
    `INSERT INTO recurring (user_id, title, category, amount, type, frequency, next_date, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, String(title).trim(), String(category).trim(), toNumber(amount), type || 'expense', frequency || 'mensal', nextDate || nowIso(), active === false ? 0 : 1]
  );

  const item = get('SELECT * FROM recurring WHERE id = ?', [result.lastInsertRowid]);
  return res.status(201).json({ ...item, amount: toNumber(item.amount), active: Boolean(item.active) });
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const { currency, theme, monthlyIncomeGoal, emergencyFundTarget } = req.body || {};
  const settings = ensureUserSettings(req.user.id);

  run(
    `UPDATE settings SET currency = ?, theme = ?, monthly_income_goal = ?, emergency_fund_target = ?, updated_at = ? WHERE user_id = ?`,
    [currency || settings.currency, theme || settings.theme, toNumber(monthlyIncomeGoal), toNumber(emergencyFundTarget), nowIso(), req.user.id]
  );

  const updated = get('SELECT * FROM settings WHERE user_id = ?', [req.user.id]);
  return res.json({
    id: updated.id,
    currency: updated.currency,
    theme: updated.theme,
    monthly_income_goal: toNumber(updated.monthly_income_goal),
    emergency_fund_target: toNumber(updated.emergency_fund_target),
  });
});

app.use((error, req, res, next) => {
  console.error('[Finance Pro API Error]', error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`Finance Pro API running on http://localhost:${PORT}`);
  });
}

export { app, databasePath, createTables, calculateDashboard };
export default app;
