// One-shot installer for native voice-stack performance libs.
//
// Tries to install @discordjs/opus (native Opus encoder) and sodium-native
// (native encryption), each ~2-3× faster than the JS fallbacks. They require
// a C compiler + Python + node-gyp:
//   - Linux: usually pre-installed (build-essential + python3)
//   - macOS: xcode-select --install
//   - Windows: Visual Studio Build Tools with "Desktop development with C++"
//     workload, OR run `npm install --global windows-build-tools` (admin)
//
// On failure, gives a clear next-step. Bot keeps working with the JS
// fallbacks (opusscript + libsodium-wrappers) regardless of whether this
// succeeds, so the script never errors fatally.

const { spawnSync } = require('node:child_process');

const PKGS = [
  { name: '@discordjs/opus', reason: 'Native Opus encoder (~2-3× faster than opusscript)' },
  { name: 'sodium-native',   reason: 'Native libsodium (~2-3× faster than libsodium-wrappers)' },
];

const tryInstall = (pkg) => {
  console.log(`\n=== ${pkg.name} ===`);
  console.log(`  ${pkg.reason}`);
  console.log(`  → npm install ${pkg.name} --no-save`);
  // Pick the correct npm binary per-platform so we don't need `shell: true`
  // (which triggers Node 22+'s DEP0190 deprecation warning).
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npmBin, ['install', pkg.name, '--no-save'], { stdio: 'inherit' });
  if (r.status === 0) {
    console.log(`  ✓ installed`);
    return true;
  }
  console.log(`  ✕ failed (exit ${r.status}) — bot keeps working with JS fallback`);
  return false;
};

const detectPlatform = () => {
  if (process.platform === 'win32') {
    return [
      '  Windows detected. If the native install fails, you need:',
      '    1. Visual Studio 2019+ with "Desktop development with C++"',
      '       (download Visual Studio Installer → Modify → check that workload)',
      '    2. Python 3 on PATH (https://python.org → install with "Add to PATH")',
      '  After installing, re-run: node scripts/install-native.js',
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '  macOS detected. If the install fails, run:',
      '    xcode-select --install',
      '  Then re-run: node scripts/install-native.js',
    ];
  }
  return [
    '  Linux detected. If the install fails, install build tools:',
    '    Debian/Ubuntu:  sudo apt install build-essential python3',
    '    RHEL/CentOS:    sudo dnf groupinstall "Development Tools" && sudo dnf install python3',
    '  Then re-run: node scripts/install-native.js',
  ];
};

(async () => {
  console.log('═══ Native voice-stack installer ═══');
  console.log('Optional performance upgrades. Bot works either way.\n');

  let ok = 0;
  for (const pkg of PKGS) if (tryInstall(pkg)) ok++;

  console.log('\n═══ Summary ═══');
  console.log(`  ${ok}/${PKGS.length} native libs installed`);
  if (ok < PKGS.length) {
    console.log('');
    detectPlatform().forEach((l) => console.log(l));
  } else {
    console.log('  All native libs installed. Restart the bot to pick them up.');
  }
  console.log('');
})();
