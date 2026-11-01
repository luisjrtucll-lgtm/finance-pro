import { useEffect, useMemo, useState } from 'react';

const tabs = [
  { id: 'dashboard', label: 'Resumo' },
  { id: 'transactions', label: 'Lançamentos' },
  { id: 'accounts', label: 'Contas' },
  { id: 'budgets', label: 'Orçamentos' },
  { id: 'goals', label: 'Metas' },
  { id: 'debts', label: 'Dívidas' },
  { id: 'cards', label: 'Cartões' },
  { id: 'investments', label: 'Invest.' },
  { id: 'recurring', label: 'Recorrentes' },
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

const defaultDebtForm = {
  name: '',
  balance: '',
  rate: '',
  monthlyPayment: '',
  dueDay: '10',
  status: 'em_andamento',
};

const defaultCardForm = {
  name: '',
  limitAmount: '',
  usedAmount: '',
  dueDay: '10',
  closingDay: '5',
  color: '#5da8ff',
};

const defaultInvestmentForm = {
  name: '',
  type: 'Renda fixa',
  value: '',
  monthlyContribution: '',
  performance: '',
};

const defaultRecurringForm = {
  title: '',
  category: 'Casa',
  amount: '',
  type: 'expense',
  frequency: 'mensal',
  nextDate: new Date().toISOString().slice(0, 10),
  active: true,
};

const defaultSettingsForm = {
  currency: 'EUR',
  theme: 'dark',
  monthlyIncomeGoal: 0,
  emergencyFundTarget: 0,
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
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [data, setData] = useState({
    dashboard: { totalBalance: 0, totalIncome: 0, totalExpense: 0, netWorth: 0, monthlySavings: 0, projectedBalance: 0, upcomingBills: 0, insights: [] },
    accounts: [],
    transactions: [],
    budgets: [],
    goals: [],
    debts: [],
    cards: [],
    investments: [],
    recurring: [],
    settings: { currency: 'EUR', theme: 'dark', monthly_income_goal: 0, emergency_fund_target: 0 },
  });
  const [transactionForm, setTransactionForm] = useState(defaultTransactionForm);
  const [accountForm, setAccountForm] = useState(defaultAccountForm);
  const [budgetForm, setBudgetForm] = useState(defaultBudgetForm);
  const [goalForm, setGoalForm] = useState(defaultGoalForm);
  const [debtForm, setDebtForm] = useState(defaultDebtForm);
  const [cardForm, setCardForm] = useState(defaultCardForm);
  const [investmentForm, setInvestmentForm] = useState(defaultInvestmentForm);
  const [recurringForm, setRecurringForm] = useState(defaultRecurringForm);
  const [settingsForm, setSettingsForm] = useState(defaultSettingsForm);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsInstalled(standalone);

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchDashboard();
    }
  }, [token]);

  useEffect(() => {
    if (data.settings) {
      setSettingsForm({
        currency: data.settings.currency || 'EUR',
        theme: data.settings.theme || 'dark',
        monthlyIncomeGoal: data.settings.monthly_income_goal || 0,
        emergencyFundTarget: data.settings.emergency_fund_target || 0,
      });
    }
  }, [data.settings]);

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
      cards: [],
      investments: [],
      recurring: [],
      settings: { currency: 'EUR', theme: 'dark', monthly_income_goal: 0, emergency_fund_target: 0 },
    });
    setShowInstallHelp(false);
  };

  const handleInstallApp = async () => {
    if (!installPrompt) {
      setShowInstallHelp(true);
      return;
    }

    try {
      const result = await installPrompt.prompt();
      if (result && result.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    } catch (error) {
      setStatusMessage('Instalação cancelada.');
    }
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

  const addDebt = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/debts', {
        method: 'POST',
        body: JSON.stringify({
          name: debtForm.name,
          balance: Number(debtForm.balance),
          rate: Number(debtForm.rate || 0),
          monthlyPayment: Number(debtForm.monthlyPayment || 0),
          dueDay: Number(debtForm.dueDay || 10),
          status: debtForm.status,
        }),
      }, token);
      setDebtForm(defaultDebtForm);
      setStatusMessage('Dívida cadastrada com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const addCard = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/cards', {
        method: 'POST',
        body: JSON.stringify({
          name: cardForm.name,
          limitAmount: Number(cardForm.limitAmount),
          usedAmount: Number(cardForm.usedAmount || 0),
          dueDay: Number(cardForm.dueDay || 10),
          closingDay: Number(cardForm.closingDay || 5),
          color: cardForm.color,
        }),
      }, token);
      setCardForm(defaultCardForm);
      setStatusMessage('Cartão cadastrado com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const addInvestment = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/investments', {
        method: 'POST',
        body: JSON.stringify({
          name: investmentForm.name,
          type: investmentForm.type,
          value: Number(investmentForm.value),
          monthlyContribution: Number(investmentForm.monthlyContribution || 0),
          performance: Number(investmentForm.performance || 0),
        }),
      }, token);
      setInvestmentForm(defaultInvestmentForm);
      setStatusMessage('Investimento cadastrado com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const addRecurring = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/recurring', {
        method: 'POST',
        body: JSON.stringify({
          title: recurringForm.title,
          category: recurringForm.category,
          amount: Number(recurringForm.amount),
          type: recurringForm.type,
          frequency: recurringForm.frequency,
          nextDate: recurringForm.nextDate,
          active: recurringForm.active,
        }),
      }, token);
      setRecurringForm(defaultRecurringForm);
      setStatusMessage('Conta recorrente cadastrada com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    try {
      await fetchWithAuth('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          currency: settingsForm.currency,
          theme: settingsForm.theme,
          monthlyIncomeGoal: Number(settingsForm.monthlyIncomeGoal || 0),
          emergencyFundTarget: Number(settingsForm.emergencyFundTarget || 0),
        }),
      }, token);
      setStatusMessage('Configurações salvas com sucesso.');
      fetchDashboard();
    } catch (error) {
      setStatusMessage(error.message);
    }
  };

  const summaryCards = useMemo(
    () => [
      { label: 'Saldo total', value: formatCurrency(data.dashboard.totalBalance), tone: 'primary' },
      { label: 'Receitas', value: formatCurrency(data.dashboard.totalIncome), tone: 'success' },
      { label: 'Despesas', value: formatCurrency(data.dashboard.totalExpense), tone: 'danger' },
      { label: 'Patrimônio líquido', value: formatCurrency(data.dashboard.netWorth), tone: 'info' },
    ],
    [data]
  );

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
              <label className="field">
                <span>Nome completo</span>
                <input value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} placeholder="Seu nome" />
              </label>
            )}

            <label className="field">
              <span>E-mail</span>
              <input type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} placeholder="nome@email.com" />
            </label>

            <label className="field">
              <span>Senha</span>
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
        <div className="brand">
          <div className="brand-icon small">F</div>
          <div>
            <p className="eyebrow">Finance Pro</p>
            <h2>Olá, {user.name.split(' ')[0]}</h2>
          </div>
        </div>

        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={handleInstallApp}>
            {isInstalled ? 'Instalado' : 'Instalar'}
          </button>
          <button type="button" className="ghost-button" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      <main className="content">
        <section className="overview-panel">
          <div className="overview-head">
            <span className="pill">Disponível</span>
            <span className="muted-label">{isInstalled ? 'App em tela cheia' : 'PWA pronta'}</span>
          </div>

          <div className="balance-block">
            <label>Saldo principal</label>
            <strong>{formatCurrency(data.dashboard.totalBalance)}</strong>
          </div>

          <div className="quick-stats">
            <div>
              <span>Economia</span>
              <strong>{formatCurrency(data.dashboard.monthlySavings)}</strong>
            </div>
            <div>
              <span>Projetado</span>
              <strong>{formatCurrency(data.dashboard.projectedBalance)}</strong>
            </div>
          </div>
        </section>

        <section className="cards-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className={`summary-card ${card.tone}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>

        {statusMessage && <div className="banner">{statusMessage}</div>}

        {showInstallHelp && (
          <section className="install-card">
            <div className="panel-header compact">
              <h3>Instalar aplicativo</h3>
            </div>
            <ol>
              <li>Toque no botão de compartilhamento do Safari.</li>
              <li>Selecione “Adicionar à Tela de Início”.</li>
              <li>Confirme para abrir em tela cheia e com aparência de app.</li>
            </ol>
            <div className="install-row">
              <button type="button" className="primary-button" onClick={handleInstallApp}>
                {installPrompt ? 'Instalar agora' : 'Ver instruções'}
              </button>
              <button type="button" className="secondary-button" onClick={() => setShowInstallHelp(false)}>
                Fechar
              </button>
            </div>
          </section>
        )}

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
                {data.transactions.length ? (
                  data.transactions.map((item) => (
                    <li key={item.id} className="list-item">
                      <div>
                        <strong>{item.description}</strong>
                        <small>{item.category} • {formatDate(item.date)}</small>
                      </div>
                      <span className={item.type === 'income' ? 'positive' : 'negative'}>
                        {item.type === 'income' ? '+' : '-'}
                        {formatCurrency(item.amount)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">Nenhum lançamento recente.</li>
                )}
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
                <label className="field">
                  <span>Tipo</span>
                  <select value={transactionForm.type} onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })}>
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                    <option value="transfer">Transferência</option>
                  </select>
                </label>

                <label className="field">
                  <span>Conta de origem</span>
                  <select value={transactionForm.accountId} onChange={(e) => setTransactionForm({ ...transactionForm, accountId: e.target.value })}>
                    <option value="">Selecione a conta</option>
                    {data.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>

                {transactionForm.type === 'transfer' && (
                  <label className="field">
                    <span>Conta de destino</span>
                    <select value={transactionForm.relatedAccountId} onChange={(e) => setTransactionForm({ ...transactionForm, relatedAccountId: e.target.value })}>
                      <option value="">Conta de destino</option>
                      {data.accounts.map((account) => (
                        <option key={`${account.id}-dest`} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="field">
                  <span>Categoria</span>
                  <input value={transactionForm.category} onChange={(e) => setTransactionForm({ ...transactionForm, category: e.target.value })} placeholder="Categoria" />
                </label>

                <label className="field">
                  <span>Descrição</span>
                  <input value={transactionForm.description} onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })} placeholder="Descrição" />
                </label>

                <label className="field">
                  <span>Valor</span>
                  <input type="number" step="0.01" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} placeholder="Valor" />
                </label>

                <label className="field">
                  <span>Data</span>
                  <input type="date" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} />
                </label>

                <label className="field">
                  <span>Notas</span>
                  <input value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} placeholder="Notas" />
                </label>

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
                <label className="field">
                  <span>Nome</span>
                  <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Nome da conta" />
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}>
                    <option value="bank">Banco</option>
                    <option value="cash">Dinheiro</option>
                    <option value="credit">Cartão</option>
                    <option value="investment">Investimento</option>
                  </select>
                </label>
                <label className="field">
                  <span>Saldo inicial</span>
                  <input type="number" step="0.01" value={accountForm.balance} onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })} placeholder="Saldo inicial" />
                </label>
                <label className="field">
                  <span>Ícone</span>
                  <input value={accountForm.icon} onChange={(e) => setAccountForm({ ...accountForm, icon: e.target.value })} placeholder="Ícone" />
                </label>
                <label className="field color-field">
                  <span>Cor</span>
                  <input value={accountForm.color} type="color" onChange={(e) => setAccountForm({ ...accountForm, color: e.target.value })} />
                </label>
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
                <label className="field">
                  <span>Categoria</span>
                  <input value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} placeholder="Categoria" />
                </label>
                <label className="field">
                  <span>Mês</span>
                  <input type="month" value={budgetForm.month} onChange={(e) => setBudgetForm({ ...budgetForm, month: e.target.value })} />
                </label>
                <label className="field">
                  <span>Limite</span>
                  <input type="number" step="0.01" value={budgetForm.limitAmount} onChange={(e) => setBudgetForm({ ...budgetForm, limitAmount: e.target.value })} placeholder="Limite" />
                </label>
                <label className="field color-field">
                  <span>Cor</span>
                  <input type="color" value={budgetForm.color} onChange={(e) => setBudgetForm({ ...budgetForm, color: e.target.value })} />
                </label>
                <button className="primary-button" type="submit">Salvar orçamento</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Orçamentos mensais</h3>
              </div>
              <ul className="list">
                {data.budgets.length ? (
                  data.budgets.map((budget) => (
                    <li key={budget.id} className="list-item">
                      <div>
                        <strong>{budget.category}</strong>
                        <small>{budget.month}</small>
                      </div>
                      <span>{formatCurrency(budget.spent)} / {formatCurrency(budget.limit_amount)}</span>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">Nenhum orçamento cadastrado.</li>
                )}
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
                <label className="field">
                  <span>Nome</span>
                  <input value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="Nome da meta" />
                </label>
                <label className="field">
                  <span>Valor alvo</span>
                  <input type="number" step="0.01" value={goalForm.targetAmount} onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })} placeholder="Valor alvo" />
                </label>
                <label className="field">
                  <span>Já guardado</span>
                  <input type="number" step="0.01" value={goalForm.currentAmount} onChange={(e) => setGoalForm({ ...goalForm, currentAmount: e.target.value })} placeholder="Já guardado" />
                </label>
                <label className="field">
                  <span>Prazo</span>
                  <input type="date" value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
                </label>
                <label className="field color-field">
                  <span>Cor</span>
                  <input type="color" value={goalForm.color} onChange={(e) => setGoalForm({ ...goalForm, color: e.target.value })} />
                </label>
                <button className="primary-button" type="submit">Salvar meta</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Metas financeiras</h3>
              </div>
              <ul className="list">
                {data.goals.length ? (
                  data.goals.map((goal) => (
                    <li key={goal.id} className="list-item">
                      <div>
                        <strong>{goal.name}</strong>
                        <small>{goal.deadline ? formatDate(goal.deadline) : 'Sem prazo'}</small>
                      </div>
                      <span>{formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}</span>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">Nenhuma meta cadastrada.</li>
                )}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'debts' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Cadastrar dívida</h3>
              </div>
              <form onSubmit={addDebt} className="form-grid compact">
                <label className="field">
                  <span>Nome</span>
                  <input value={debtForm.name} onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })} placeholder="Nome da dívida" />
                </label>
                <label className="field">
                  <span>Saldo</span>
                  <input type="number" step="0.01" value={debtForm.balance} onChange={(e) => setDebtForm({ ...debtForm, balance: e.target.value })} placeholder="Saldo" />
                </label>
                <label className="field">
                  <span>Taxa %</span>
                  <input type="number" step="0.01" value={debtForm.rate} onChange={(e) => setDebtForm({ ...debtForm, rate: e.target.value })} placeholder="Taxa %" />
                </label>
                <label className="field">
                  <span>Pagamento mensal</span>
                  <input type="number" step="0.01" value={debtForm.monthlyPayment} onChange={(e) => setDebtForm({ ...debtForm, monthlyPayment: e.target.value })} placeholder="Pagamento mensal" />
                </label>
                <label className="field">
                  <span>Vencimento</span>
                  <input type="number" min="1" max="31" value={debtForm.dueDay} onChange={(e) => setDebtForm({ ...debtForm, dueDay: e.target.value })} placeholder="Dia do vencimento" />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={debtForm.status} onChange={(e) => setDebtForm({ ...debtForm, status: e.target.value })}>
                    <option value="em_andamento">Em andamento</option>
                    <option value="quitada">Quitada</option>
                    <option value="atrasada">Atrasada</option>
                  </select>
                </label>
                <button className="primary-button" type="submit">Salvar dívida</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Dívidas e pagamentos</h3>
              </div>
              <ul className="list">
                {data.debts.length ? (
                  data.debts.map((debt) => (
                    <li key={debt.id} className="list-item">
                      <div>
                        <strong>{debt.name}</strong>
                        <small>Dia {debt.due_day || 1}</small>
                      </div>
                      <span>{formatCurrency(debt.balance)}</span>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">Nenhuma dívida cadastrada.</li>
                )}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'cards' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Cadastrar cartão</h3>
              </div>
              <form onSubmit={addCard} className="form-grid compact">
                <label className="field">
                  <span>Nome</span>
                  <input value={cardForm.name} onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })} placeholder="Nome do cartão" />
                </label>
                <label className="field">
                  <span>Limite</span>
                  <input type="number" step="0.01" value={cardForm.limitAmount} onChange={(e) => setCardForm({ ...cardForm, limitAmount: e.target.value })} placeholder="Limite" />
                </label>
                <label className="field">
                  <span>Usado</span>
                  <input type="number" step="0.01" value={cardForm.usedAmount} onChange={(e) => setCardForm({ ...cardForm, usedAmount: e.target.value })} placeholder="Usado" />
                </label>
                <label className="field">
                  <span>Vencimento</span>
                  <input type="number" min="1" max="31" value={cardForm.dueDay} onChange={(e) => setCardForm({ ...cardForm, dueDay: e.target.value })} placeholder="Vencimento" />
                </label>
                <label className="field">
                  <span>Fechamento</span>
                  <input type="number" min="1" max="31" value={cardForm.closingDay} onChange={(e) => setCardForm({ ...cardForm, closingDay: e.target.value })} placeholder="Fechamento" />
                </label>
                <label className="field color-field">
                  <span>Cor</span>
                  <input type="color" value={cardForm.color} onChange={(e) => setCardForm({ ...cardForm, color: e.target.value })} />
                </label>
                <button className="primary-button" type="submit">Salvar cartão</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Cartões</h3>
              </div>
              <ul className="list">
                {data.cards.length ? (
                  data.cards.map((card) => (
                    <li key={card.id} className="list-item">
                      <div>
                        <strong>{card.name}</strong>
                        <small>Vence dia {card.due_day || 1}</small>
                      </div>
                      <span>{formatCurrency(card.limit_amount)}</span>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">Nenhum cartão cadastrado.</li>
                )}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'investments' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Cadastrar investimento</h3>
              </div>
              <form onSubmit={addInvestment} className="form-grid compact">
                <label className="field">
                  <span>Nome</span>
                  <input value={investmentForm.name} onChange={(e) => setInvestmentForm({ ...investmentForm, name: e.target.value })} placeholder="Nome do investimento" />
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select value={investmentForm.type} onChange={(e) => setInvestmentForm({ ...investmentForm, type: e.target.value })}>
                    <option value="Renda fixa">Renda fixa</option>
                    <option value="Ações">Ações</option>
                    <option value="FIIs">FIIs</option>
                    <option value="Cripto">Cripto</option>
                  </select>
                </label>
                <label className="field">
                  <span>Valor atual</span>
                  <input type="number" step="0.01" value={investmentForm.value} onChange={(e) => setInvestmentForm({ ...investmentForm, value: e.target.value })} placeholder="Valor atual" />
                </label>
                <label className="field">
                  <span>Contribuição mensal</span>
                  <input type="number" step="0.01" value={investmentForm.monthlyContribution} onChange={(e) => setInvestmentForm({ ...investmentForm, monthlyContribution: e.target.value })} placeholder="Contribuição mensal" />
                </label>
                <label className="field">
                  <span>Performance</span>
                  <input type="number" step="0.01" value={investmentForm.performance} onChange={(e) => setInvestmentForm({ ...investmentForm, performance: e.target.value })} placeholder="Performance %" />
                </label>
                <button className="primary-button" type="submit">Salvar investimento</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Investimentos</h3>
              </div>
              <ul className="list">
                {data.investments.length ? (
                  data.investments.map((investment) => (
                    <li key={investment.id} className="list-item">
                      <div>
                        <strong>{investment.name}</strong>
                        <small>{investment.type}</small>
                      </div>
                      <span>{formatCurrency(investment.value)}</span>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">Nenhum investimento cadastrado.</li>
                )}
              </ul>
            </section>
          </div>
        )}

        {activeTab === 'recurring' && (
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Despesas recorrentes</h3>
              </div>
              <form onSubmit={addRecurring} className="form-grid compact">
                <label className="field">
                  <span>Título</span>
                  <input value={recurringForm.title} onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })} placeholder="Título" />
                </label>
                <label className="field">
                  <span>Categoria</span>
                  <input value={recurringForm.category} onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })} placeholder="Categoria" />
                </label>
                <label className="field">
                  <span>Valor</span>
                  <input type="number" step="0.01" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} placeholder="Valor" />
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select value={recurringForm.type} onChange={(e) => setRecurringForm({ ...recurringForm, type: e.target.value })}>
                    <option value="expense">Despesa</option>
                    <option value="income">Receita</option>
                  </select>
                </label>
                <label className="field">
                  <span>Frequência</span>
                  <select value={recurringForm.frequency} onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value })}>
                    <option value="mensal">Mensal</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="anual">Anual</option>
                  </select>
                </label>
                <label className="field">
                  <span>Próxima data</span>
                  <input type="date" value={recurringForm.nextDate} onChange={(e) => setRecurringForm({ ...recurringForm, nextDate: e.target.value })} />
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={recurringForm.active} onChange={(e) => setRecurringForm({ ...recurringForm, active: e.target.checked })} />
                  Ativa
                </label>
                <button className="primary-button" type="submit">Salvar recorrente</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Contas a vencer</h3>
              </div>
              <ul className="list">
                {data.recurring.length ? (
                  data.recurring.map((item) => (
                    <li key={item.id} className="list-item">
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.frequency}</small>
                      </div>
                      <span>{formatCurrency(item.amount)}</span>
                    </li>
                  ))
                ) : (
                  <li className="empty-state">Nenhuma conta recorrente.</li>
                )}
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

            <section className="panel">
              <div className="panel-header">
                <h3>Configurações</h3>
              </div>
              <form onSubmit={saveSettings} className="form-grid compact">
                <label className="field">
                  <span>Moeda</span>
                  <select value={settingsForm.currency} onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}>
                    <option value="EUR">Euro (€)</option>
                    <option value="BRL">Real (R$)</option>
                    <option value="USD">Dólar ($)</option>
                  </select>
                </label>
                <label className="field">
                  <span>Tema</span>
                  <select value={settingsForm.theme} onChange={(e) => setSettingsForm({ ...settingsForm, theme: e.target.value })}>
                    <option value="dark">Tema escuro</option>
                    <option value="light">Tema claro</option>
                  </select>
                </label>
                <label className="field">
                  <span>Meta de renda mensal</span>
                  <input type="number" step="0.01" value={settingsForm.monthlyIncomeGoal} onChange={(e) => setSettingsForm({ ...settingsForm, monthlyIncomeGoal: e.target.value })} placeholder="Meta de renda" />
                </label>
                <label className="field">
                  <span>Meta de reserva</span>
                  <input type="number" step="0.01" value={settingsForm.emergencyFundTarget} onChange={(e) => setSettingsForm({ ...settingsForm, emergencyFundTarget: e.target.value })} placeholder="Reserva de emergência" />
                </label>
                <button className="primary-button" type="submit">Salvar configurações</button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
