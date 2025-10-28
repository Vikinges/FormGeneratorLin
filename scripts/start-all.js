const { spawn } = require('child_process');
const path = require('path');

const serverPort = process.env.PORT || '3001';
const clientPort =
  process.env.CLIENT_PORT || process.env.FRONTEND_PORT || '3000';

const workers = [];
let shuttingDown = false;

const shutdown = (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  workers.forEach(({ name, child }) => {
    if (child && !child.killed) {
      console.log(`[start] stopping ${name}…`);
      child.kill('SIGINT');
    }
  });

  setTimeout(() => process.exit(exitCode), 500);
};

const spawnProcess = (name, command, args, options = {}) => {
  console.log(`[start] launching ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options
  });

  workers.push({ name, child });

  child.on('exit', (code, signal) => {
    if (signal || shuttingDown) {
      return;
    }

    if (code !== 0) {
      console.error(`[start] ${name} exited with code ${code}`);
    } else {
      console.log(`[start] ${name} exited.`);
    }

    shutdown(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(`[start] failed to launch ${name}:`, error);
    shutdown(1);
  });

  return child;
};

process.on('SIGINT', () => {
  console.log('\n[start] caught SIGINT, shutting down…');
  shutdown(0);
});

process.on('SIGTERM', () => {
  console.log('\n[start] caught SIGTERM, shutting down…');
  shutdown(0);
});

console.log(`[start] API:      http://localhost:${serverPort}`);
console.log(`[start] Frontend: http://localhost:${clientPort}`);

spawnProcess('server', 'npm', ['run', 'start:server'], {
  env: {
    ...process.env,
    PORT: serverPort
  }
});

spawnProcess('client', 'npm', ['start', '--', `--port=${clientPort}`], {
  cwd: path.join(__dirname, '..', 'client'),
  env: {
    ...process.env,
    PORT: clientPort
  }
});
