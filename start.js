#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🎨 Iniciando r/place...\n');

// Verificar si existe la carpeta backend
if (!fs.existsSync(path.join(__dirname, 'backend'))) {
  console.error('❌ No se encontró la carpeta backend');
  process.exit(1);
}

// Verificar si existe package.json en backend
if (!fs.existsSync(path.join(__dirname, 'backend', 'package.json'))) {
  console.error('❌ No se encontró package.json en backend');
  process.exit(1);
}

// Verificar si node_modules existe
if (!fs.existsSync(path.join(__dirname, 'backend', 'node_modules'))) {
  console.log('📦 Instalando dependencias...');
  const install = spawn('npm', ['install'], {
    cwd: path.join(__dirname, 'backend'),
    stdio: 'inherit',
    shell: true
  });

  install.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Dependencias instaladas\n');
      startServer();
    } else {
      console.error('❌ Error instalando dependencias');
      process.exit(1);
    }
  });
} else {
  startServer();
}

function startServer() {
  console.log('🚀 Iniciando servidor backend...');
  console.log('📱 Abre http://localhost:3000 en tu navegador\n');

  const server = spawn('npm', ['start'], {
    cwd: path.join(__dirname, 'backend'),
    stdio: 'inherit',
    shell: true
  });

  server.on('close', (code) => {
    console.log(`\n🛑 Servidor cerrado con código ${code}`);
  });

  // Manejar Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando servidor...');
    server.kill('SIGINT');
    process.exit(0);
  });
}

