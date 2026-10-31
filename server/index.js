import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import Database from 'better-sqlite3';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'finance-pro-secret';
const databaseDir = path.join(process.cwd(), 'data');
const databasePath = process.env.DATABASE_PATH || path.join(databaseDir, 'finance-pro.db');

fs.mkdirSync(databaseDir, { recursive: true });
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

const getUserFromToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }

  const token = authHeader.split(' ')[1];
  const payload = getUserFromToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  req.user = payload;
  next();
};

const initDatabase = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      currency TEXT DEFAULT 'EUR',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      icon TEXT,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      related_account_id INTEGER,
      type TEXT NOT NULL,
      category TEXT,
      description TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'EUR',
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      month TEXT NOT NULL,
      limit_amount REAL NOT NULL,
      spent_amount REAL DEFAULT 0,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      deadline TEXT,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      balance REAL NOT NULL,
      rate REAL DEFAULT 0,
      monthly_payment REAL DEFAULT 0,
      due_day INTEGER,
      status TEXT DEFAULT 'em_andamento',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      monthly_contribution REAL DEFAULT 0,
      performance REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      limit_amount REAL NOT NULL,
      used_amount REAL DEFAULT 0,
      due_day INTEGER,
      closing_day INTEGER,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      frequency TEXT NOT NULL,
      next_date TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      currency TEXT DEFAULT 'EUR',
      theme TEXT DEFAULT 'dark',
      monthly_income_goal REAL DEFAULT 0,
      emergency_fund_target REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const insertDefaultUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@financepro.app');
  if (!insertDefaultUser) {
    const adminHash = bcrypt.hashSync('FinancePro123', 10);
    db.prepare(`INSERT INTO users (name, email, password_hash, currency) VALUES (?, ?, ?, ?)`).run('Administrador', 'admin@financepro.app', adminHash, 'EUR');
  }
};

const getSettings = (userId) => {
  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
  if (!settings) {
    const user = db.prepare('SELECT currency FROM users WHERE id = ?').get(userId);
    const defaultCurrency = user?.currency || 'EUR';
    db.prepare('INSERT INTO settings (user_id, currency, theme) VALUES (?, ?, ?)').run(userId, defaultCurrency, 'dark');
    return { user_id: userId, currency: defaultCurrency, theme: 'dark', monthly_income_goal: 0, emergency_fund_target: 0 };
  }
  return settings;
};

const toNum = (value) => Number(value || 0);

const getDashboardData = (userId) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(userId);
  const budgets = db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC, category ASC').all(userId);
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY deadline ASC').all(userId);
  const debts = db.prepare('SELECT * FROM debts WHERE user_id = ? ORDER BY due_day ASC').all(userId);
  const investments = db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  const cards = db.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY due_day ASC').all(userId);
  const recurring = db.prepare('SELECT * FROM recurring WHERE user_id = ? ORDER BY next_date ASC').all(userId);
  const settings = getSettings(userId);

  const totalBalance = accounts.reduce((sum, item) => sum + toNum(item.balance), 0);
  const investmentsValue = investments.reduce((sum, item) => sum + toNum(item.value), 0);
  const totalNetWorth = totalBalance + investmentsValue;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthTransactions = transactions.filter((item) => item.date.startsWith(currentMonth));
  const income = currentMonthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + toNum(item.amount), 0);
  const expense = currentMonthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + toNum(item.amount), 0);

  const budgetInsights = budgets.map((budget) => {
    const spent = currentMonthTransactions.filter((item) => item.category === budget.category && item.type === 'expense').reduce((sum, item) => sum + toNum(item.amount), 0);
    return {
      ...budget,
      spent,
      status: spent > budget.limit_amount ? 'acima' : spent > budget.limit_amount * 0.8 ? 'alerta' : 'ok',
    };
  });

  const insights = [];
  if (expense > income) {
    insights.push({
      title: 'Gasto acima da renda',
      description: 'As despesas do mês estão acima das receitas. Revise os gastos recorrentes e priorize a redução de compras não essenciais.',
      type: 'warning',
    });
  }

  const highestExpense = [...currentMonthTransactions]
    .filter((item) => item.type === 'expense')
    .sort((a, b) => toNum(b.amount) - toNum(a.amount))[0];

  if (highestExpense) {
    insights.push({
      title: 'Maior categoria de gasto',
      description: `${highestExpense.category || 'Geral'} representa o maior impacto do mês com ${currencyFormatter(highestExpense.amount)} em despesas.',
      type: 'info',
    });
  }

  const monthlyProjection = income - expense;
  insights.push({
    title: 'Projeção mensal',
    description: `Com base no comportamento atual, o saldo projetado para o fim do mês é ${currencyFormatter(monthlyProjection)}.`,
    type: 'success',
  });

  if (monthsToTarget(goals, currentMonth) > 0) {
    insights.push({
      title: 'Meta em progresso',
      description: 'Você está acompanhando as metas financeiras com tendência positiva. Mantenha a disciplina para alcançar os objetivos previstos.',
      type: 'info',
    });
  }

  return {
    dashboard: {
      totalBalance,
      totalIncome: income,
      totalExpense: expense,
      netWorth: totalNetWorth,
      monthlySavings: income - expense,
      projectedBalance: totalBalance + (income - expense),
      upcomingBills: recurring.filter((item) => item.active).length,
      insights,
    },
    accounts,
    transactions: transactions.slice(0, 12),
    budgets: budgetInsights,
    goals,
    debts,
    investments,
    cards,
    recurring,
    settings,
  };
};

const currencyFormatter = (value) => {
  const numericValue = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(numericValue);
};

const monthsToTarget = (goals, currentMonth) => {
  return goals.filter((goal) => goal.deadline && goal.deadline.startsWith(currentMonth)).length;
};

initDatabase();

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', name: 'Finance Pro' });
});

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existingUser) {
    return res.status(409).json({ error: 'Este e-mail já está em uso.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = db.prepare('INSERT INTO users (name, email, password_hash, currency) VALUES (?, ?, ?, ?)').run(name.trim(), email.toLowerCase(), passwordHash, 'EUR');
  db.prepare('INSERT INTO settings (user_id, currency, theme) VALUES (?, ?, ?)').run(user.lastInsertRowid, 'EUR', 'dark');
  db.prepare('INSERT INTO accounts (user_id, name, type, balance, currency, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(user.lastInsertRowid, 'Dinheiro em espécie', 'cash', 0, 'EUR', 'cash', '#3dd598');

  const token = jwt.sign({ id: user.lastInsertRowid, email: email.toLowerCase(), name: name.trim() }, JWT_SECRET, { expiresIn: '7d' });
  return res.status(201).json({
    token,
    user: {
      id: user.lastInsertRowid,
      name: name.trim(),
      email: email.toLowerCase(),
      currency: 'EUR',
    },
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      currency: user.currency,
    },
  });
});

app.get('/api/dashboard', authMiddleware, (req, res) => {
  const data = getDashboardData(req.user.id);
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email }, ...data });
});

app.get('/api/accounts', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(data);
});

app.post('/api/accounts', authMiddleware, (req, res) => {
  const { name, type, balance, currency, icon, color } = req.body || {};
  if (!name || !type) {
    return res.status(400).json({ error: 'Nome e tipo da conta são obrigatórios.' });
  }

  const account = db.prepare('INSERT INTO accounts (user_id, name, type, balance, currency, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, type, Number(balance || 0), currency || 'EUR', icon || 'wallet', color || '#6fe3ff');

  res.status(201).json({ id: account.lastInsertRowid, ...req.body, balance: Number(balance || 0) });
});

app.put('/api/accounts/:id', authMiddleware, (req, res) => {
  const { name, type, balance, currency, icon, color } = req.body || {};
  const updated = db.prepare('UPDATE accounts SET name = ?, type = ?, balance = ?, currency = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?')
    .run(name, type, Number(balance || 0), currency || 'EUR', icon || 'wallet', color || '#6fe3ff', Number(req.params.id), req.user.id);

  if (!updated.changes) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json({ success: true });
});

app.delete('/api/accounts/:id', authMiddleware, (req, res) => {
  const removed = db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  if (!removed.changes) return res.status(404).json({ error: 'Conta não encontrada.' });
  db.prepare('DELETE FROM transactions WHERE account_id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ success: true });
});

app.get('/api/transactions', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(req.user.id);
  res.json(data);
});

app.post('/api/transactions', authMiddleware, (req, res) => {
  const { accountId, relatedAccountId, type, category, description, amount, date, notes } = req.body || {};
  if (!accountId || !type || !description || !amount || !date) {
    return res.status(400).json({ error: 'Dados incompletos para o lançamento.' });
  }

  const amountNumber = Number(amount);
  const transaction = db.prepare('INSERT INTO transactions (user_id, account_id, related_account_id, type, category, description, amount, currency, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, Number(accountId), relatedAccountId ? Number(relatedAccountId) : null, type, category || 'Geral', description, amountNumber, 'EUR', date, notes || '');

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(Number(accountId), req.user.id);
  if (account) {
    const updatedBalance = type === 'income' ? account.balance + amountNumber : type === 'expense' ? account.balance - amountNumber : account.balance;
    db.prepare('UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?').run(updatedBalance, Number(accountId), req.user.id);
  }

  if (relatedAccountId && type === 'transfer') {
    const related = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(Number(relatedAccountId), req.user.id);
    if (related) {
      const transferEntry = db.prepare('INSERT INTO transactions (user_id, account_id, related_account_id, type, category, description, amount, currency, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(req.user.id, Number(relatedAccountId), Number(accountId), 'transfer', 'Transferência', `Recebimento de ${description}`, amountNumber, 'EUR', date, '');
      db.prepare('UPDATE accounts SET balance = ? WHERE id = ? AND user_id = ?').run(related.balance + amountNumber, Number(relatedAccountId), req.user.id);
    }
  }

  res.status(201).json({ id: transaction.lastInsertRowid, message: 'Lançamento registrado com sucesso.' });
});

app.put('/api/transactions/:id', authMiddleware, (req, res) => {
  const { description, amount, category, date, notes } = req.body || {};
  const updated = db.prepare('UPDATE transactions SET description = ?, amount = ?, category = ?, date = ?, notes = ? WHERE id = ? AND user_id = ?')
    .run(description, Number(amount || 0), category || 'Geral', date, notes || '', Number(req.params.id), req.user.id);

  if (!updated.changes) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  res.json({ success: true });
});

app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
  const removed = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  if (!removed.changes) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  res.json({ success: true });
});

app.get('/api/budgets', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC, category ASC').all(req.user.id);
  res.json(data);
});

app.post('/api/budgets', authMiddleware, (req, res) => {
  const { category, month, limitAmount, color } = req.body || {};
  if (!category || !month || !limitAmount) {
    return res.status(400).json({ error: 'Categoria, mês e limite são obrigatórios.' });
  }

  const budget = db.prepare('INSERT INTO budgets (user_id, category, month, limit_amount, spent_amount, color) VALUES (?, ?, ?, ?, 0, ?)')
    .run(req.user.id, category, month, Number(limitAmount), color || '#6fe3ff');

  res.status(201).json({ id: budget.lastInsertRowid });
});

app.put('/api/budgets/:id', authMiddleware, (req, res) => {
  const { category, month, limitAmount, color } = req.body || {};
  const updated = db.prepare('UPDATE budgets SET category = ?, month = ?, limit_amount = ?, color = ? WHERE id = ? AND user_id = ?')
    .run(category, month, Number(limitAmount || 0), color || '#6fe3ff', Number(req.params.id), req.user.id);
  if (!updated.changes) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  res.json({ success: true });
});

app.delete('/api/budgets/:id', authMiddleware, (req, res) => {
  const removed = db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  if (!removed.changes) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  res.json({ success: true });
});

app.get('/api/goals', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY deadline ASC').all(req.user.id);
  res.json(data);
});

app.post('/api/goals', authMiddleware, (req, res) => {
  const { name, targetAmount, currentAmount, deadline, color } = req.body || {};
  if (!name || !targetAmount) {
    return res.status(400).json({ error: 'Nome e valor final da meta são obrigatórios.' });
  }

  const goal = db.prepare('INSERT INTO goals (user_id, name, target_amount, current_amount, deadline, color) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, Number(targetAmount), Number(currentAmount || 0), deadline || null, color || '#3dd598');

  res.status(201).json({ id: goal.lastInsertRowid });
});

app.put('/api/goals/:id', authMiddleware, (req, res) => {
  const { name, targetAmount, currentAmount, deadline, color } = req.body || {};
  const updated = db.prepare('UPDATE goals SET name = ?, target_amount = ?, current_amount = ?, deadline = ?, color = ? WHERE id = ? AND user_id = ?')
    .run(name, Number(targetAmount || 0), Number(currentAmount || 0), deadline || null, color || '#3dd598', Number(req.params.id), req.user.id);
  if (!updated.changes) return res.status(404).json({ error: 'Meta não encontrada.' });
  res.json({ success: true });
});

app.delete('/api/goals/:id', authMiddleware, (req, res) => {
  const removed = db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  if (!removed.changes) return res.status(404).json({ error: 'Meta não encontrada.' });
  res.json({ success: true });
});

app.get('/api/debts', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM debts WHERE user_id = ? ORDER BY due_day ASC').all(req.user.id);
  res.json(data);
});

app.post('/api/debts', authMiddleware, (req, res) => {
  const { name, balance, rate, monthlyPayment, dueDay, status } = req.body || {};
  if (!name || !balance) {
    return res.status(400).json({ error: 'Nome e saldo da dívida são obrigatórios.' });
  }

  const debt = db.prepare('INSERT INTO debts (user_id, name, balance, rate, monthly_payment, due_day, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, Number(balance), Number(rate || 0), Number(monthlyPayment || 0), Number(dueDay || 1), status || 'em_andamento');

  res.status(201).json({ id: debt.lastInsertRowid });
});

app.get('/api/investments', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(data);
});

app.post('/api/investments', authMiddleware, (req, res) => {
  const { name, type, value, monthlyContribution, performance } = req.body || {};
  if (!name || !type || !value) {
    return res.status(400).json({ error: 'Dados do investimento estão incompletos.' });
  }

  const investment = db.prepare('INSERT INTO investments (user_id, name, type, value, monthly_contribution, performance) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, type, Number(value), Number(monthlyContribution || 0), Number(performance || 0));
  res.status(201).json({ id: investment.lastInsertRowid });
});

app.get('/api/cards', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY due_day ASC').all(req.user.id);
  res.json(data);
});

app.post('/api/cards', authMiddleware, (req, res) => {
  const { name, limitAmount, usedAmount, dueDay, closingDay, color } = req.body || {};
  if (!name || !limitAmount) {
    return res.status(400).json({ error: 'Nome e limite do cartão são obrigatórios.' });
  }

  const card = db.prepare('INSERT INTO cards (user_id, name, limit_amount, used_amount, due_day, closing_day, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, name, Number(limitAmount), Number(usedAmount || 0), Number(dueDay || 10), Number(closingDay || 5), color || '#5da8ff');
  res.status(201).json({ id: card.lastInsertRowid });
});

app.get('/api/recurring', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM recurring WHERE user_id = ? ORDER BY next_date ASC').all(req.user.id);
  res.json(data);
});

app.post('/api/recurring', authMiddleware, (req, res) => {
  const { title, category, amount, type, frequency, nextDate, active } = req.body || {};
  if (!title || !amount || !type) {
    return res.status(400).json({ error: 'Título, tipo e valor são obrigatórios.' });
  }

  const recurring = db.prepare('INSERT INTO recurring (user_id, title, category, amount, type, frequency, next_date, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, title, category || 'Geral', Number(amount), type, frequency || 'mensal', nextDate || new Date().toISOString().slice(0, 10), active ? 1 : 0);
  res.status(201).json({ id: recurring.lastInsertRowid });
});

app.get('/api/settings', authMiddleware, (req, res) => {
  res.json(getSettings(req.user.id));
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const { currency, theme, monthlyIncomeGoal, emergencyFundTarget } = req.body || {};
  const current = getSettings(req.user.id);
  db.prepare('UPDATE settings SET currency = ?, theme = ?, monthly_income_goal = ?, emergency_fund_target = ? WHERE user_id = ?')
    .run(currency || current.currency, theme || current.theme, Number(monthlyIncomeGoal || 0), Number(emergencyFundTarget || 0), req.user.id);

  db.prepare('UPDATE users SET currency = ? WHERE id = ?').run(currency || current.currency, req.user.id);
  res.json({ success: true });
});

const clientDist = path.join(process.cwd(), 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`Finance Pro API listening on http://localhost:${PORT}`);
});
