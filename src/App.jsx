import { useEffect, useMemo, useState } from 'react';

const tabs = [
  { id: 'dashboard', label: 'Resumo' },
  { id: 'transactions', label: 'Lançamentos' },
  { id: 'accounts', label: 'Contas' },
  { id: 'budgets', label: 'Orçamentos' },
  { id: 'goals', label: 'Metas' },
  { id: 'debts', label: 'Dívidas' },
  { id: 'investments', label: 'Invest.' },
  { id: 'reports', label: 'Relatórios' },
];

const defaultTransactionForm = {
  accountId: '',
  relatedAccountId: '',
  type: 'expense',
  category: 'Casa',
  description: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
};

const defaultAccountForm = {
  name: '',
  type: 'bank',
  balance: '',
  currency: 'EUR',
  icon: 'bank',
  color: '#6fe3ff',
};

const defaultBudgetForm = {
  category: '',
  month: new Date().toISOString().slice(0, 7),
  limitAmount: '',
  color: '#6fe3ff',
};

const defaultGoalForm = {
  name: '',
  targetAmount: '',
  currentAmount: '',
  deadline: '',
  color: '#3dd598',
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
};

const fetchWithAuth = async (url, options = {}, token) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || 'Erro ao processar a solicitação.');
  }

  return payload;
};

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('finance-pro-token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('finance-pro-user');
    return raw ? JSON.parse(raw) : null;
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState({
    dashboard: { totalBalance: 0, totalIncome: 0, totalExpense: 0, netWorth: 0, monthlySavings: 0, projectedBalance: 0, upcomingBills: 0, insights: [] },
    accounts: [],
    transactions: [],
    budgets: [],
    goals: [],
    debts: [],
    investments: [],
    cards: [],
    recurring: [],
    settings: { currency: 'EUR' },
  });
  const [transactionForm, setTransactionForm] = useState(defaultTransactionForm);
  const [accountForm, setAccountForm] = useState(defaultAccountForm);
  const [budgetForm, setBudgetForm] = useState(defaultBudgetForm);
  const [goalForm, setGoalForm] = useState(defaultGoalForm);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (token) {
      fetchDashboard();
    }
  }, [token]);

  const fetchDashboard = async () => {
    if (!token) return;
    try {
      const payload = await fetchWithAuth('/api/dashboard', {}, token);
      setData(payload);
      setStatusMessage('Dados atualizados com sucesso.');
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    if (!authForm.email || !authForm.password || (authMode === 'register' && !authForm.name)) {
      setStatusMessage('Preencha todos os campos para continuar.');
      return;
    }

    try {
      const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
      const payload = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        }),
      });

      localStorage.setItem('finance-pro-token', payload.token);
      localStorage.setItem('finance-pro-user', JSON.stringify(payload.user));
      setToken(payload.token);
      setUser(payload.user);
      setStatusMessage(authMode === 'register' ? 'Cadastro realizado com sucesso.' : 'Login realizado com sucesso.');
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('finance-pro-token');
    localStorage.removeItem('finance-pro-user');
    setToken('');
    setUser(null);
    setData({
      dashboard: { totalBalance: 0, totalIncome: 0, totalExpense: 0, netWorth: 0, monthlySavings: 0, projectedBalance: 0, upcomingBills: 0, insights: [] },
      accounts: [],
      transactions: [],
      budgets: [],
      goals: [],
      debts: [],
      investments: [],
      cards: [],
      recurring: [],
      settings: { currency: 'EUR' },
    });
  };

  const addTransaction = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: Number(transactionForm.accountId),
          relatedAccountId: transactionForm.relatedAccountId ? Number(transactionForm.relatedAccountId) : null,
          type: transactionForm.type,
          category: transactionForm.category,
          description: transactionForm.description,
          amount: Number(transactionForm.amount),
          date: transactionForm.date,
          notes: transactionForm.notes,
        }),
      }, token);
      setTransactionForm(defaultTransactionForm);
      setStatusMessage('Lançamento criado com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const addAccount = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: accountForm.name,
          type: accountForm.type,
          balance: Number(accountForm.balance || 0),
          currency: accountForm.currency,
          icon: accountForm.icon,
          color: accountForm.color,
        }),
      }, token);
      setAccountForm(defaultAccountForm);
      setStatusMessage('Conta cadastrada com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const addBudget = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          category: budgetForm.category,
          month: budgetForm.month,
          limitAmount: Number(budgetForm.limitAmount),
          color: budgetForm.color,
        }),
      }, token);
      setBudgetForm(defaultBudgetForm);
      setStatusMessage('Orçamento cadastrado com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const addGoal = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/goals', {
        method: 'POST',
        body: JSON.stringify({
          name: goalForm.name,
          targetAmount: Number(goalForm.targetAmount),
          currentAmount: Number(goalForm.currentAmount || 0),
          deadline: goalForm.deadline,
          color: goalForm.color,
        }),
      }, token);
      setGoalForm(defaultGoalForm);
      setStatusMessage('Meta cadastrada com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const summaryCards = useMemo(() => [
    { label: 'Saldo total', value: formatCurrency(data.dashboard.totalBalance), tone: 'primary' },
    { label: 'Receitas', value: formatCurrency(data.dashboard.totalIncome), tone: 'success' },
    { label: 'Despesas', value: formatCurrency(data.dashboard.totalExpense), tone: 'danger' },
    { label: 'Patrimônio líquido', value: formatCurrency(data.dashboard.netWorth), tone: 'info' },
  ], [data]);

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-block">
            <div className="brand-icon">F</div>
            <div>
              <p className="eyebrow">Finance Pro</p>
              <h1>Controle financeiro inteligente</h1>
            </div>
          </div>

          <div className="switcher">
            <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
              Entrar
            </button>
            <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
              Cadastrar
            </button>
          </div>

          <form onSubmit={handleAuth} className="auth-form">
            {authMode === 'register' && (
              <label>
                Nome completo
                <input value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Seu nome" />
              </label>
            )}

            <label>
              E-mail
              <input type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} placeholder="nome@email.com" />
            </label>

            <label>
              Senha
              <input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} placeholder="••••••••" />
            </label>

            {statusMessage && <p className="status-message">{statusMessage}</p>}

            <button className="primary-button" type="submit">
              {authMode === 'login' ? 'Entrar no Finance Pro' : 'Criar conta'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Finance Pro</p>
          <h2>Olá, {user.name.split(' ')[0]}</h2>
        </div>
        <button type="button" className="ghost-button" onClick={handleLogout}>Sair</button>
      </header>

      <div className="content">
        <section className="cards-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className={`summary-card ${card.tone}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>

        {statusMessage && <div className="banner">{statusMessage}</div>}

        <nav className="tab-nav" aria-label="Navegação principal">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'dashboard' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Inteligência financeira</h3>
              </div>
              <div className="insights-grid">
                {data.dashboard.insights.map((insight, index) => (
                  <div key={`${insight.title}-${index}`} className={`insight-item ${insight.type}`}>
                    <h4>{insight.title}</h4>
                    <p>{insight.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Últimos lançamentos</h3>
              </div>
              <ul className="list">
                {data.transactions.length ? data.transactions.map((item) => (
                  <li key={item.id} className="list-item">
                    <div>
                      <strong>{item.description}</strong>
                      <small>{item.category} • {formatDate(item.date)}</small>
                    </div>
                    <span className={item.type === 'income' ? 'positive' : 'negative'}>
                      {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                    </span>
                  </li>
                )) : <li className="empty-state">Nenhum lançamento recente.</li>}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Registrar lançamento</h3>
              </div>
              <form onSubmit={addTransaction} className="form-grid">
                <select value={transactionForm.type} onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })}>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                  <option value="transfer">Transferência</option>
                </select>
                <select value={transactionForm.accountId} onChange={(e) => setTransactionForm({ ...transactionForm, accountId: e.target.value })}>
                  <option value="">Selecione a conta</option>
                  {data.accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                {transactionForm.type === 'transfer' && (
                  <select value={transactionForm.relatedAccountId} onChange={(e) => setTransactionForm({ ...transactionForm, relatedAccountId: e.target.value })}>
                    <option value="">Conta de destino</option>
                    {data.accounts.map((account) => (
                      <option key={`${account.id}-dest`} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                )}
                <input value={transactionForm.category} onChange={(e) => setTransactionForm({ ...transactionForm, category: e.target.value })} placeholder="Categoria" />
                <input value={transactionForm.description} onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })} placeholder="Descrição" />
                <input type="number" step="0.01" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} placeholder="Valor" />
                <input type="date" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} />
                <input value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} placeholder="Notas" />
                <button className="primary-button" type="submit">Salvar lançamento</button>
              </form>
            </section>
          </div>
        )}

        {activeTab === 'accounts' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Adicionar conta</h3>
              </div>
              <form onSubmit={addAccount} className="form-grid compact">
                <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Nome da conta" />
                <select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}>
                  <option value="bank">Banco</option>
                  <option value="cash">Dinheiro</option>
                  <option value="credit">Cartão</option>
                  <option value="investment">Investimento</option>
                </select>
                <input type="number" step="0.01" value={accountForm.balance} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} placeholder="Saldo inicial" />
                <input value={accountForm.icon} onChange={(e) => setAccountForm({ ...accountForm, icon: e.target.value })} placeholder="Ícone" />
                <input value={accountForm.color} type="color" onChange={(e) => setAccountForm({ ...accountForm, color: e.target.value })} />
                <button className="primary-button" type="submit">Salvar conta</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Contas cadastradas</h3>
              </div>
              <div className="account-grid">
                {data.accounts.map((account) => (
                  <div key={account.id} className="account-card" style={{ borderLeft: `4px solid ${account.color || '#6fe3ff'}` }}>
                    <strong>{account.name}</strong>
                    <span>{account.type}</span>
                    <b>{formatCurrency(account.balance)}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'budgets' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Adicionar orçamento</h3>
              </div>
              <form onSubmit={addBudget} className="form-grid compact">
                <input value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} placeholder="Categoria" />
                <input type="month" value={budgetForm.month} onChange={(e) => setBudgetForm({ ...budgetForm, month: e.target.value })} />
                <input type="number" step="0.01" value={budgetForm.limitAmount} onChange={(e) => setBudgetForm({ ...budgetForm, limitAmount: e.target.value })} placeholder="Limite" />
                <input type="color" value={budgetForm.color} onChange={(e) => setBudgetForm({ ...budgetForm, color: e.target.value })} />
                <button className="primary-button" type="submit">Salvar orçamento</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Orçamentos mensais</h3>
              </div>
              <ul className="list">
                {data.budgets.length ? data.budgets.map((budget) => (
                  <li key={budget.id} className="list-item">
                    <div>
                      <strong>{budget.category}</strong>
                      <small>{budget.month}</small>
                    </div>
                    <span>{formatCurrency(budget.spent)} / {formatCurrency(budget.limit_amount)}</span>
                  </li>
                )) : <li className="empty-state">Nenhum orçamento cadastrado.</li>}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Adicionar meta</h3>
              </div>
              <form onSubmit={addGoal} className="form-grid compact">
                <input value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="Nome da meta" />
                <input type="number" step="0.01" value={goalForm.targetAmount} onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })} placeholder="Valor alvo" />
                <input type="number" step="0.01" value={goalForm.currentAmount} onChange={(e) => setGoalForm({ ...goalForm, currentAmount: e.target.value })} placeholder="Já guardado" />
                <input type="date" value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
                <input type="color" value={goalForm.color} onChange={(e) => setGoalForm({ ...goalForm, color: e.target.value })} />
                <button className="primary-button" type="submit">Salvar meta</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Metas financeiras</h3>
              </div>
              <ul className="list">
                {data.goals.length ? data.goals.map((goal) => (
                  <li key={goal.id} className="list-item">
                    <div>
                      <strong>{goal.name}</strong>
                      <small>{goal.deadline ? formatDate(goal.deadline) : 'Sem prazo'}</small>
                    </div>
                    <span>{formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}</span>
                  </li>
                )) : <li className="empty-state">Nenhuma meta cadastrada.</li>}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'debts' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Dívidas e pagamentos</h3>
              </div>
              <ul className="list">
                {data.debts.length ? data.debts.map((debt) => (
                  <li key={debt.id} className="list-item">
                    <div>
                      <strong>{debt.name}</strong>
                      <small>Dia {debt.due_day || 1}</small>
                    </div>
                    <span>{formatCurrency(debt.balance)}</span>
                  </li>
                )) : <li className="empty-state">Nenhuma dívida cadastrada.</li>}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'investments' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Investimentos</h3>
              </div>
              <ul className="list">
                {data.investments.length ? data.investments.map((investment) => (
                  <li key={investment.id} className="list-item">
                    <div>
                      <strong>{investment.name}</strong>
                      <small>{investment.type}</small>
                    </div>
                    <span>{formatCurrency(investment.value)}</span>
                  </li>
                )) : <li className="empty-state">Nenhum investimento cadastrado.</li>}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Relatórios e projeções</h3>
              </div>
              <div className="report-grid">
                <div className="metric-box">
                  <label>Total em contas</label>
                  <strong>{formatCurrency(data.dashboard.totalBalance)}</strong>
                </div>
                <div className="metric-box">
                  <label>Economia mensal</label>
                  <strong>{formatCurrency(data.dashboard.monthlySavings)}</strong>
                </div>
                <div className="metric-box">
                  <label>Saldo projetado</label>
                  <strong>{formatCurrency(data.dashboard.projectedBalance)}</strong>
                </div>
                <div className="metric-box">
                  <label>Faturas próximas</label>
                  <strong>{data.dashboard.upcomingBills}</strong>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
