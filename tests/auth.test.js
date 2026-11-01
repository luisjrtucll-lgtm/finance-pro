import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import test from 'node:test';

const { app } = await import('../server/index.js');

const makeRequest = async (method, path, body, token) => {
  const response = await fetch(`http://127.0.0.1:3001${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : {},
  };
};

test('register and login flow works', async () => {
  const random = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `user-${random}@example.com`;

  const register = await makeRequest('POST', '/api/register', {
    name: 'Alice',
    email,
    password: '123456',
  });

  assert.equal(register.status, 201);
  assert.ok(register.body.token);
  assert.equal(register.body.user.email, email);

  const login = await makeRequest('POST', '/api/login', {
    email,
    password: '123456',
  });

  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});

test('dashboard requires auth and returns metrics', async () => {
  const random = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `dashboard-${random}@example.com`;

  const register = await makeRequest('POST', '/api/register', {
    name: 'Dashboard User',
    email,
    password: '654321',
  });

  const dashboard = await makeRequest('GET', '/api/dashboard', null, register.body.token);
  assert.equal(dashboard.status, 200);
  assert.ok(dashboard.body.dashboard);
  assert.equal(typeof dashboard.body.dashboard.totalBalance, 'number');

  const noAuth = await makeRequest('GET', '/api/dashboard');
  assert.equal(noAuth.status, 401);
});
