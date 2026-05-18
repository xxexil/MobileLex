#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const envLocalPath = path.join(root, '.env.local');

function parseArgs(argv) {
  const args = {
    device: process.env.ANDROID_DEVICE_IP || '',
    port: process.env.ANDROID_ADB_PORT || '5555',
    pair: process.env.ANDROID_PAIR || '',
    pairCode: process.env.ANDROID_PAIR_CODE || '',
    tcpip: process.env.ANDROID_TCPIP === '1',
    doctor: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => argv[++i] || '';

    if (arg === '--device' || arg === '--device-ip') args.device = readValue();
    else if (arg.startsWith('--device=')) args.device = arg.slice('--device='.length);
    else if (arg === '--port') args.port = readValue();
    else if (arg.startsWith('--port=')) args.port = arg.slice('--port='.length);
    else if (arg === '--pair') args.pair = readValue();
    else if (arg.startsWith('--pair=')) args.pair = arg.slice('--pair='.length);
    else if (arg === '--pair-code') args.pairCode = readValue();
    else if (arg.startsWith('--pair-code=')) args.pairCode = arg.slice('--pair-code='.length);
    else if (arg === '--tcpip') args.tcpip = true;
    else if (arg === '--doctor') args.doctor = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8').split('\n').reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return acc;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    acc[key] = value;
    return acc;
  }, {});
}

function getAdbCommand() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const localAppData = process.env.LOCALAPPDATA || process.env.LocalAppData || process.env.localappdata;
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === 'win32' && localAppData
      ? path.join(localAppData, 'Android', 'Sdk')
      : '',
  ].filter(Boolean);

  for (const sdkRoot of candidates) {
    const sdkAdb = path.join(sdkRoot, 'platform-tools', exe);
    if (fs.existsSync(sdkAdb)) return sdkAdb;
  }

  return exe;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    shell: false,
  });

  if (options.stdio === 'inherit') return result;
  return {
    ...result,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
}

function runNpx(args, options = {}) {
  if (process.platform === 'win32') {
    return run('cmd.exe', ['/d', '/c', `npx.cmd ${args.join(' ')}`], options);
  }

  return run('npx', args, options);
}

function printHelp() {
  console.log(`
LexConnect Android wireless runner

Usage:
  npm run android:wireless -- --device 192.168.1.23
  npm run android:wireless -- --device 192.168.1.23:5555
  npm run android:wireless -- --tcpip --device 192.168.1.23
  npm run android:wireless -- --doctor --pair 192.168.1.23:37123 --device 192.168.1.23:42117
  npm run android:wireless -- --pair 192.168.1.23:37123 --pair-code 123456 --device 192.168.1.23:42117

Android 10 or lower / USB TCP mode:
  1. Plug phone in once.
  2. Run: npm run android:wireless -- --tcpip --device PHONE_IP
  3. Unplug phone after it connects.

Android 11+ Wireless debugging:
  1. Enable Developer options > Wireless debugging.
  2. Pair with code using --pair PHONE_IP:PAIR_PORT --pair-code CODE.
  3. Connect using --device PHONE_IP:CONNECT_PORT.
`);
}

function normalizeDeviceTarget(device, fallbackPort) {
  if (!device) return '';
  return device.includes(':') ? device : `${device}:${fallbackPort}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getExpoDeviceName(devicesOutput, target) {
  const line = (devicesOutput || '')
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${target}\t`) || entry.startsWith(`${target} `));
  if (!line) return target;

  const modelItem = line.split(/\s+/).find((item) => item.startsWith('model:'));
  return modelItem ? modelItem.slice('model:'.length) : target;
}

function parseAdbDevices(devicesOutput) {
  return (devicesOutput || '')
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.toLowerCase().startsWith('list of devices'))
    .map((entry) => {
      const [id, state] = entry.split(/\s+/);
      return { id, state };
    })
    .filter((device) => device.id && device.state);
}

function cleanupWirelessAdbDevices(adb, target) {
  const targetHost = target.split(':')[0];
  if (!targetHost) return;

  const devices = parseAdbDevices(run(adb, ['devices', '-l']).output);
  devices
    .filter((device) => device.id.includes(':'))
    .filter((device) => device.id.split(':')[0] === targetHost)
    .filter((device) => device.id !== target || device.state !== 'device')
    .forEach((device) => {
      console.log(`Disconnecting stale wireless adb target ${device.id} (${device.state})...`);
      const disconnectResult = run(adb, ['disconnect', device.id]);
      if (disconnectResult.output) console.log(disconnectResult.output);
    });
}

function getUsbDeviceIds(adb) {
  const devices = run(adb, ['devices']);
  const lines = (devices.output || '').split('\n');
  return lines
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state === 'device' && !id.includes(':'))
    .map(([id]) => id);
}

function enableTcpip(adb, port) {
  const usbDeviceIds = getUsbDeviceIds(adb);
  if (usbDeviceIds.length === 0) {
    return {
      ok: false,
      message: 'No USB-connected adb device was found. Plug the phone in once, allow USB debugging, then retry with --tcpip.',
    };
  }

  const selected = usbDeviceIds[0];
  if (usbDeviceIds.length > 1) {
    console.log(`\nMultiple USB devices found. Using ${selected}.`);
  }

  console.log(`\nEnabling wireless ADB TCP/IP mode on ${selected} at port ${port}...`);
  const result = run(adb, ['-s', selected, 'tcpip', String(port)]);
  if (result.output) console.log(result.output);

  if (result.status !== 0 || /error|failed|unauthorized/i.test(result.output || '')) {
    return {
      ok: false,
      message: 'Could not enable adb tcpip mode. Check the phone authorization prompt and USB cable.',
    };
  }

  return { ok: true };
}

function runDoctor(adb, args, target) {
  console.log('\nWireless ADB doctor');

  const devices = run(adb, ['devices', '-l']);
  console.log('\nadb devices -l');
  console.log(devices.output || '(no output)');

  const targetsToCheck = [args.pair, target].filter(Boolean);
  if (process.platform === 'win32' && targetsToCheck.length > 0) {
    for (const endpoint of targetsToCheck) {
      const [host, port] = endpoint.split(':');
      if (!host || !port) continue;
      console.log(`\nTesting TCP reachability for ${endpoint}...`);
      const ps = run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Test-NetConnection -ComputerName ${host} -Port ${port} | Select-Object ComputerName,RemotePort,TcpTestSucceeded`,
      ]);
      console.log(ps.output || '(no output)');
    }
  }

  console.log('\nChecklist');
  console.log('- Keep the pairing popup open while running adb pair.');
  console.log('- Use the popup port for adb pair only.');
  console.log('- Use the main Wireless debugging port for adb connect.');
  console.log('- Turn off VPN/private DNS temporarily on the phone and PC.');
  console.log('- Make the Windows network profile Private and allow adb.exe through Firewall.');
  console.log('- If paired devices list has stale PCs, remove them and toggle Wireless debugging off/on.');
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const mobileEnv = {
  ...parseEnvFile(envPath),
  ...parseEnvFile(envLocalPath),
};
const sharedHost = (mobileEnv.EXPO_PUBLIC_SHARED_BACKEND_HOST || '').trim();
const adb = getAdbCommand();
const target = normalizeDeviceTarget(args.device, args.port);

const hostCheck = run(process.execPath, [path.join('scripts', 'check-hosts.js'), '--mobile-only'], { stdio: 'inherit' });
if (hostCheck.status !== 0) {
  process.exit(hostCheck.status || 1);
}

const adbVersion = run(adb, ['version']);
if (adbVersion.error || adbVersion.status !== 0) {
  console.error('\nCould not run adb. Install Android platform tools or set ANDROID_HOME / ANDROID_SDK_ROOT.');
  if (adbVersion.output) console.error(adbVersion.output);
  process.exit(1);
}

if (args.doctor) {
  runDoctor(adb, args, target);
  process.exit(0);
}

if (args.pair) {
  if (!args.pairCode) {
    console.error('\nMissing --pair-code. Example: --pair 192.168.1.23:37123 --pair-code 123456');
    process.exit(1);
  }
  console.log(`\nPairing with ${args.pair}...`);
  const pairResult = run(adb, ['pair', args.pair, args.pairCode], { stdio: 'inherit' });
  if (pairResult.status !== 0) process.exit(pairResult.status || 1);
}

if (args.tcpip) {
  const tcpipResult = enableTcpip(adb, args.port);
  if (!tcpipResult.ok) {
    console.error(`\n${tcpipResult.message}`);
    process.exit(1);
  }
}

if (target) {
  cleanupWirelessAdbDevices(adb, target);
  console.log(`\nConnecting to ${target}...`);
  const connectResult = run(adb, ['connect', target]);
  if (connectResult.output) console.log(connectResult.output);
  if (connectResult.status !== 0 || /failed|unable|cannot|refused/i.test(connectResult.output || '')) {
    const refused = /refused|10061/i.test(connectResult.output || '');
    const hasExplicitPort = args.device.includes(':');
    if (!args.tcpip && refused && !hasExplicitPort) {
      const tcpipResult = enableTcpip(adb, args.port);
      if (tcpipResult.ok) {
        console.log(`\nRetrying ${target}...`);
        const retryResult = run(adb, ['connect', target]);
        if (retryResult.output) console.log(retryResult.output);
        if (retryResult.status === 0 && !/failed|unable|cannot|refused/i.test(retryResult.output || '')) {
          // Continue into device verification below.
        } else {
          console.error('\nWireless ADB still refused the connection. Keep the phone plugged in, confirm USB debugging is allowed, and check the phone IP.');
          process.exit(retryResult.status || 1);
        }
      } else {
        console.error(`\nWireless ADB is not enabled on the phone. ${tcpipResult.message}`);
        process.exit(1);
      }
    } else {
      console.error('\nWireless ADB connection failed. Confirm the phone and PC are on the same Wi-Fi network.');
      if (refused && hasExplicitPort) {
        console.error('That IP:port is not accepting adb connections right now. Reopen Wireless debugging and use the current IP address & port.');
      }
      if (target.endsWith(':5555')) {
        console.error('Android 11+ Wireless debugging uses the IP address and port shown on the phone, not 5555.');
        console.error('Example from your phone: npm run android:wireless -- --device 192.168.110.188:38053');
      }
      process.exit(connectResult.status || 1);
    }
  }
} else {
  console.error('\nMissing wireless device IP.');
  printHelp();
  process.exit(1);
}

const devices = run(adb, ['devices', '-l']);
if (devices.output) console.log(`\n${devices.output}`);
if (!devices.output.includes(target) || !new RegExp(`${escapeRegExp(target)}\\s+device`).test(devices.output)) {
  console.error(`\n${target} is not listed as an active adb device.`);
  process.exit(1);
}
const expoDeviceName = getExpoDeviceName(devices.output, target);

const expoEnv = {
  ...process.env,
  ANDROID_SERIAL: target,
  REACT_NATIVE_PACKAGER_HOSTNAME: sharedHost || process.env.REACT_NATIVE_PACKAGER_HOSTNAME || '',
};

console.log(`\nStarting Expo Android build for ${target}...`);
if (expoDeviceName !== target) {
  console.log(`Expo device name: ${expoDeviceName}`);
}
if (expoEnv.REACT_NATIVE_PACKAGER_HOSTNAME) {
  console.log(`Metro host: ${expoEnv.REACT_NATIVE_PACKAGER_HOSTNAME}`);
}

const expoResult = runNpx(['expo', 'run:android', '--device', expoDeviceName], {
  env: expoEnv,
  stdio: 'inherit',
});

if (expoResult.error) {
  console.error(`\nCould not start Expo Android build: ${expoResult.error.message}`);
  process.exit(1);
}

process.exit(expoResult.status || 0);
