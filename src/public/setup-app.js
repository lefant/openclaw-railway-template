// Served at /setup/app.js
// No fancy syntax: keep it maximally compatible.

(function () {
  var statusEl = document.getElementById('status');
  var authGroupEl = document.getElementById('authGroup');
  var authChoiceEl = document.getElementById('authChoice');
  var logEl = document.getElementById('log');

  function setStatus(s) {
    statusEl.textContent = s;
  }

  var showAllAuthMethods = false;

  function renderAuth(groups) {
    authGroupEl.innerHTML = '';
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var opt = document.createElement('option');
      opt.value = g.value;
      opt.textContent = g.label + (g.hint ? ' - ' + g.hint : '');
      authGroupEl.appendChild(opt);
    }

    authGroupEl.onchange = function () {
      var sel = null;
      for (var j = 0; j < groups.length; j++) {
        if (groups[j].value === authGroupEl.value) sel = groups[j];
      }
      authChoiceEl.innerHTML = '';
      var opts = (sel && sel.options) ? sel.options : [];
      
      // Filter out interactive OAuth options unless "Show all" is enabled
      var filteredOpts = [];
      var hiddenCount = 0;
      
      for (var k = 0; k < opts.length; k++) {
        var o = opts[k];
        var isInteractive = (
          o.value.toLowerCase().indexOf('cli') >= 0 ||
          o.value.toLowerCase().indexOf('oauth') >= 0 ||
          o.value.toLowerCase().indexOf('device') >= 0 ||
          o.value.toLowerCase().indexOf('codex') >= 0 ||
          o.value.toLowerCase().indexOf('antigravity') >= 0 ||
          o.value.toLowerCase().indexOf('gemini-cli') >= 0 ||
          o.value.toLowerCase().indexOf('qwen-portal') >= 0 ||
          o.value.toLowerCase().indexOf('github-copilot') >= 0
        );
        
        if (!isInteractive || showAllAuthMethods) {
          filteredOpts.push(o);
        } else {
          hiddenCount++;
        }
      }
      
      // Render filtered options
      for (var m = 0; m < filteredOpts.length; m++) {
        var opt2 = document.createElement('option');
        opt2.value = filteredOpts[m].value;
        opt2.textContent = filteredOpts[m].label + (filteredOpts[m].hint ? ' - ' + filteredOpts[m].hint : '');
        authChoiceEl.appendChild(opt2);
      }
      
      // Add "Show all auth methods" option if there are hidden options
      if (hiddenCount > 0 && !showAllAuthMethods) {
        var showAllOpt = document.createElement('option');
        showAllOpt.value = '__show_all__';
        showAllOpt.textContent = '⚠️ Show all auth methods (' + hiddenCount + ' hidden - require terminal/OAuth)';
        showAllOpt.style.fontWeight = 'bold';
        showAllOpt.style.color = '#ff9800';
        authChoiceEl.appendChild(showAllOpt);
      }
    };

    authGroupEl.onchange();
  }

  // Handle "Show all auth methods" selection
  authChoiceEl.onchange = function () {
    if (authChoiceEl.value === '__show_all__') {
      showAllAuthMethods = true;
      authGroupEl.onchange(); // Re-render with all options
    }
  };

  function httpJson(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('HTTP ' + res.status + ': ' + (t || res.statusText));
        });
      }
      return res.json();
    });
  }

  function loadAuthGroups() {
    return httpJson('/setup/api/auth-groups').then(function (j) {
      if (!j.authGroups || j.authGroups.length === 0) {
        console.warn('Auth groups empty, trying status endpoint...');
        throw new Error('Empty auth groups');
      }
      renderAuth(j.authGroups);
    }).catch(function (e) {
      console.error('Failed to load auth groups from fast endpoint:', e);
      // Fallback to loading from status if fast endpoint fails
      return httpJson('/setup/api/status').then(function (j) {
        if (!j.authGroups || j.authGroups.length === 0) {
          console.warn('Auth groups empty in status endpoint too');
          setStatus('Warning: Unable to load provider list. Setup wizard may not work correctly.');
        }
        renderAuth(j.authGroups || []);
      }).catch(function (e2) {
        console.error('Failed to load auth groups from status endpoint:', e2);
        setStatus('Warning: Unable to load provider list. Setup wizard may not work correctly.');
        renderAuth([]); // Render empty to unblock UI
      });
    });
  }

  function refreshStatus() {
    setStatus('Loading...');
    var statusDetailsEl = document.getElementById('statusDetails');
    if (statusDetailsEl) {
      statusDetailsEl.innerHTML = '';
    }

    return httpJson('/setup/api/status').then(function (j) {
      var ver = j.openclawVersion ? (' | ' + j.openclawVersion) : '';
      setStatus((j.configured ? 'Configured - open /openclaw' : 'Not configured - run setup below') + ver);
      
      // Show gateway target and health hints
      if (statusDetailsEl) {
        var detailsHtml = '<div class="muted" style="font-size: 0.9em;">';
        detailsHtml += '<strong>Gateway Target:</strong> <code>' + (j.gatewayTarget || 'unknown') + '</code><br/>';
        detailsHtml += '<strong>Health Check:</strong> <a href="/healthz" target="_blank">/healthz</a> (shows gateway diagnostics)';
        detailsHtml += '</div>';
        statusDetailsEl.innerHTML = detailsHtml;
      }

      // If channels are unsupported, surface it for debugging.
      if (j.channelsAddHelp && j.channelsAddHelp.indexOf('telegram') === -1) {
        logEl.textContent += '\nNote: this openclaw build does not list telegram in `channels add --help`. Telegram auto-add will be skipped.\n';
      }

    }).catch(function (e) {
      setStatus('Error: ' + String(e));
      if (statusDetailsEl) {
        statusDetailsEl.innerHTML = '<div style="color: #d32f2f;">Failed to load status details</div>';
      }
    });
  }

  document.getElementById('run').onclick = function () {
    var payload = {
      flow: document.getElementById('flow').value,
      authChoice: authChoiceEl.value,
      authSecret: document.getElementById('authSecret').value,
      telegramToken: document.getElementById('telegramToken').value,
      discordToken: document.getElementById('discordToken').value,
      slackBotToken: document.getElementById('slackBotToken').value,
      slackAppToken: document.getElementById('slackAppToken').value,
      // Custom provider fields
      customProviderId: document.getElementById('customProviderId').value,
      customProviderBaseUrl: document.getElementById('customProviderBaseUrl').value,
      customProviderApi: document.getElementById('customProviderApi').value,
      customProviderApiKeyEnv: document.getElementById('customProviderApiKeyEnv').value,
      customProviderModelId: document.getElementById('customProviderModelId').value
    };

    logEl.textContent = 'Running...\n';

    fetch('/setup/api/run', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text();
    }).then(function (text) {
      var j;
      try { j = JSON.parse(text); } catch (_e) { j = { ok: false, output: text }; }
      logEl.textContent += (j.output || JSON.stringify(j, null, 2));
      return refreshStatus();
    }).catch(function (e) {
      logEl.textContent += '\nError: ' + String(e) + '\n';
    });
  };

  // Pairing approve helper
  var pairingBtn = document.getElementById('pairingApprove');
  if (pairingBtn) {
    pairingBtn.onclick = function () {
      var channel = prompt('Enter channel (telegram or discord):');
      if (!channel) return;
      channel = channel.trim().toLowerCase();
      if (channel !== 'telegram' && channel !== 'discord') {
        alert('Channel must be "telegram" or "discord"');
        return;
      }
      var code = prompt('Enter pairing code (e.g. 3EY4PUYS):');
      if (!code) return;
      logEl.textContent += '\nApproving pairing for ' + channel + '...\n';
      fetch('/setup/api/pairing/approve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: channel, code: code.trim() })
      }).then(function (r) { return r.text(); })
        .then(function (t) { logEl.textContent += t + '\n'; })
        .catch(function (e) { logEl.textContent += 'Error: ' + String(e) + '\n'; });
    };
  }

  document.getElementById('reset').onclick = function () {
    if (!confirm('Reset setup? This deletes the config file so onboarding can run again.')) return;
    logEl.textContent = 'Resetting...\n';
    fetch('/setup/api/reset', { method: 'POST', credentials: 'same-origin' })
      .then(function (res) { return res.text(); })
      .then(function (t) { logEl.textContent += t + '\n'; return refreshStatus(); })
      .catch(function (e) { logEl.textContent += 'Error: ' + String(e) + '\n'; });
  };

  // ========== DEBUG CONSOLE ==========
  var consoleCommandEl = document.getElementById('consoleCommand');
  var consoleArgEl = document.getElementById('consoleArg');
  var consoleRunBtn = document.getElementById('consoleRun');
  var consoleOutputEl = document.getElementById('consoleOutput');

  function runConsoleCommand() {
    var command = consoleCommandEl.value;
    var arg = consoleArgEl.value.trim();

    if (!command) {
      consoleOutputEl.textContent = 'Error: Please select a command';
      return;
    }

    // Disable button and show loading state
    consoleRunBtn.disabled = true;
    consoleRunBtn.textContent = 'Running...';
    consoleOutputEl.textContent = 'Executing command...\n';

    fetch('/setup/api/console/run', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: command, arg: arg })
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, text: text };
        });
      })
      .then(function (result) {
        var j;
        try {
          j = JSON.parse(result.text);
        } catch (_e) {
          j = { ok: false, error: result.text };
        }

        if (j.ok) {
          consoleOutputEl.textContent = j.output || '(no output)';
        } else {
          consoleOutputEl.textContent = 'Error: ' + (j.error || j.output || 'Unknown error');
        }

        // Re-enable button
        consoleRunBtn.disabled = false;
        consoleRunBtn.textContent = 'Run Command';
      })
      .catch(function (e) {
        consoleOutputEl.textContent = 'Error: ' + String(e);
        consoleRunBtn.disabled = false;
        consoleRunBtn.textContent = 'Run Command';
      });
  }

  consoleRunBtn.onclick = runConsoleCommand;

  // Enter key in arg field executes command
  consoleArgEl.onkeydown = function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      runConsoleCommand();
    }
  };

  // ========== CONFIG EDITOR ==========
  var configPathEl = document.getElementById('configPath');
  var configContentEl = document.getElementById('configContent');
  var configReloadBtn = document.getElementById('configReload');
  var configSaveBtn = document.getElementById('configSave');
  var configOutputEl = document.getElementById('configOutput');

  function loadConfig() {
    configOutputEl.textContent = 'Loading config...';
    configReloadBtn.disabled = true;
    configSaveBtn.disabled = true;

    fetch('/setup/api/config/raw', {
      method: 'GET',
      credentials: 'same-origin'
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, text: text };
        });
      })
      .then(function (result) {
        var j;
        try {
          j = JSON.parse(result.text);
        } catch (_e) {
          j = { ok: false, error: result.text };
        }

        if (j.ok) {
          configPathEl.textContent = j.path || 'Unknown';
          configContentEl.value = j.content || '';
          if (j.exists) {
            configOutputEl.textContent = 'Config loaded successfully';
          } else {
            configOutputEl.textContent = 'Config file does not exist yet. Run onboarding first.';
          }
        } else {
          configOutputEl.textContent = 'Error: ' + (j.error || 'Unknown error');
        }

        configReloadBtn.disabled = false;
        configSaveBtn.disabled = false;
      })
      .catch(function (e) {
        configOutputEl.textContent = 'Error: ' + String(e);
        configReloadBtn.disabled = false;
        configSaveBtn.disabled = false;
      });
  }

  function saveConfig() {
    var content = configContentEl.value;

    configOutputEl.textContent = 'Saving config...';
    configReloadBtn.disabled = true;
    configSaveBtn.disabled = true;
    configSaveBtn.textContent = 'Saving...';

    fetch('/setup/api/config/raw', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: content })
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, text: text };
        });
      })
      .then(function (result) {
        var j;
        try {
          j = JSON.parse(result.text);
        } catch (_e) {
          j = { ok: false, error: result.text };
        }

        if (j.ok) {
          configOutputEl.textContent = 'Success: ' + (j.message || 'Config saved') + '\n' + (j.restartOutput || '');
        } else {
          configOutputEl.textContent = 'Error: ' + (j.error || 'Unknown error');
        }

        configReloadBtn.disabled = false;
        configSaveBtn.disabled = false;
        configSaveBtn.textContent = 'Save & restart gateway';
      })
      .catch(function (e) {
        configOutputEl.textContent = 'Error: ' + String(e);
        configReloadBtn.disabled = false;
        configSaveBtn.disabled = false;
        configSaveBtn.textContent = 'Save & restart gateway';
      });
  }

  if (configReloadBtn) {
    configReloadBtn.onclick = loadConfig;
  }

  if (configSaveBtn) {
    configSaveBtn.onclick = saveConfig;
  }

  // Auto-load config on page load
  loadConfig();

  // ========== DEVICE PAIRING HELPER ==========
  var devicesRefreshBtn = document.getElementById('devicesRefresh');
  var devicesListEl = document.getElementById('devicesList');

  function refreshDevices() {
    if (!devicesListEl) return;

    devicesListEl.innerHTML = '<p class="muted">Loading...</p>';
    if (devicesRefreshBtn) {
      devicesRefreshBtn.disabled = true;
      devicesRefreshBtn.textContent = 'Loading...';
    }

    fetch('/setup/api/devices/pending', {
      method: 'GET',
      credentials: 'same-origin'
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, text: text };
        });
      })
      .then(function (result) {
        var j;
        try {
          j = JSON.parse(result.text);
        } catch (_e) {
          j = { ok: false, error: result.text };
        }

        if (j.ok) {
          if (j.requestIds && j.requestIds.length > 0) {
            var html = '<p class="muted">Found ' + j.requestIds.length + ' pending device(s):</p>';
            html += '<ul style="list-style: none; padding: 0;">';
            for (var i = 0; i < j.requestIds.length; i++) {
              var reqId = j.requestIds[i];
              html += '<li id="device-' + reqId + '" style="padding: 0.5rem; margin-bottom: 0.5rem; background: #f5f5f5; border-radius: 4px;">';
              html += '<code style="font-weight: bold;">' + reqId + '</code> ';
              html += '<button class="approve-device" data-requestid="' + reqId + '" style="margin-left: 0.5rem;">Approve</button>';
              html += '</li>';
            }
            html += '</ul>';
            html += '<details style="margin-top: 0.75rem;"><summary style="cursor: pointer;">Show raw output</summary>';
            html += '<pre style="margin-top: 0.5rem; background: #f5f5f5; padding: 0.5rem; border-radius: 4px; font-size: 11px; max-height: 200px; overflow-y: auto;">' + (j.output || '(no output)') + '</pre>';
            html += '</details>';
            devicesListEl.innerHTML = html;

            // Attach click handlers to approve buttons
            var approveButtons = devicesListEl.querySelectorAll('.approve-device');
            for (var k = 0; k < approveButtons.length; k++) {
              approveButtons[k].onclick = function (e) {
                var btn = e.target;
                var reqId = btn.getAttribute('data-requestid');
                approveDevice(reqId, btn);
              };
            }
          } else {
            devicesListEl.innerHTML = '<p class="muted">No pending devices found.</p>';
            if (j.output) {
              devicesListEl.innerHTML += '<details style="margin-top: 0.5rem;"><summary style="cursor: pointer;">Show raw output</summary>';
              devicesListEl.innerHTML += '<pre style="margin-top: 0.5rem; background: #f5f5f5; padding: 0.5rem; border-radius: 4px; font-size: 11px; max-height: 200px; overflow-y: auto;">' + j.output + '</pre>';
              devicesListEl.innerHTML += '</details>';
            }
          }
        } else {
          devicesListEl.innerHTML = '<p style="color: #d32f2f;">Error: ' + (j.error || j.output || 'Unknown error') + '</p>';
        }

        if (devicesRefreshBtn) {
          devicesRefreshBtn.disabled = false;
          devicesRefreshBtn.textContent = 'Refresh pending devices';
        }
      })
      .catch(function (e) {
        devicesListEl.innerHTML = '<p style="color: #d32f2f;">Error: ' + String(e) + '</p>';
        if (devicesRefreshBtn) {
          devicesRefreshBtn.disabled = false;
          devicesRefreshBtn.textContent = 'Refresh pending devices';
        }
      });
  }

  function approveDevice(requestId, buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Approving...';

    fetch('/setup/api/devices/approve', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: requestId })
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, text: text };
        });
      })
      .then(function (result) {
        var j;
        try {
          j = JSON.parse(result.text);
        } catch (_e) {
          j = { ok: false, error: result.text };
        }

        if (j.ok) {
          // Visual feedback: green background and checkmark
          var deviceEl = document.getElementById('device-' + requestId);
          if (deviceEl) {
            deviceEl.style.background = '#4caf50';
            deviceEl.style.color = '#fff';
          }
          buttonEl.textContent = 'Approved ✓';
          buttonEl.disabled = true;
        } else {
          buttonEl.textContent = 'Failed';
          buttonEl.disabled = false;
          alert('Approval failed: ' + (j.error || j.output || 'Unknown error'));
        }
      })
      .catch(function (e) {
        buttonEl.textContent = 'Error';
        buttonEl.disabled = false;
        alert('Error: ' + String(e));
      });
  }

  if (devicesRefreshBtn) {
    devicesRefreshBtn.onclick = refreshDevices;
  }

  // ========== BACKUP IMPORT ==========
  var importFileEl = document.getElementById('importFile');
  var importButtonEl = document.getElementById('importButton');
  var importOutputEl = document.getElementById('importOutput');

  function importBackup() {
    var file = importFileEl.files[0];
    
    if (!file) {
      importOutputEl.textContent = 'Error: Please select a file';
      return;
    }

    // Validate file type
    var fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.tar.gz') && !fileName.endsWith('.tgz')) {
      importOutputEl.textContent = 'Error: File must be a .tar.gz or .tgz archive';
      return;
    }

    // Validate file size (250MB max)
    var maxSize = 250 * 1024 * 1024;
    if (file.size > maxSize) {
      importOutputEl.textContent = 'Error: File size exceeds 250MB limit (got ' + Math.round(file.size / 1024 / 1024) + 'MB)';
      return;
    }

    // Confirmation dialog
    var confirmMsg = 'Import backup from "' + file.name + '"?\n\n' +
                     'This will:\n' +
                     '- Stop the gateway\n' +
                     '- Overwrite existing config and workspace\n' +
                     '- Restart the gateway\n' +
                     '- Reload this page\n\n' +
                     'Are you sure?';
    
    if (!confirm(confirmMsg)) {
      importOutputEl.textContent = 'Import cancelled';
      return;
    }

    // Disable button and show progress
    importButtonEl.disabled = true;
    importButtonEl.textContent = 'Importing...';
    importOutputEl.textContent = 'Uploading ' + file.name + ' (' + Math.round(file.size / 1024 / 1024) + 'MB)...\n';

    // Upload file
    fetch('/setup/import', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/gzip'
      },
      body: file
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, text: text };
        });
      })
      .then(function (result) {
        var j;
        try {
          j = JSON.parse(result.text);
        } catch (_e) {
          j = { ok: false, error: result.text };
        }

        if (j.ok) {
          importOutputEl.textContent = 'Success: ' + (j.message || 'Import completed') + '\n\nReloading page in 2 seconds...';
          
          // Reload page after successful import to show fresh state
          setTimeout(function () {
            window.location.reload();
          }, 2000);
        } else {
          importOutputEl.textContent = 'Error: ' + (j.error || 'Import failed');
          importButtonEl.disabled = false;
          importButtonEl.textContent = 'Import backup';
        }
      })
      .catch(function (e) {
        importOutputEl.textContent = 'Error: ' + String(e);
        importButtonEl.disabled = false;
        importButtonEl.textContent = 'Import backup';
      });
  }

  if (importButtonEl) {
    importButtonEl.onclick = importBackup;
  }

  // ========== DEVICE AUTH FLOW ==========
  var deviceAuthCardEl = document.getElementById('deviceAuthCard');
  var deviceAuthStep1El = document.getElementById('deviceAuthStep1');
  var deviceAuthStep2El = document.getElementById('deviceAuthStep2');
  var deviceAuthStep3El = document.getElementById('deviceAuthStep3');
  var deviceAuthProviderNameEl = document.getElementById('deviceAuthProviderName');
  var deviceAuthStartBtnEl = document.getElementById('deviceAuthStartBtn');
  var deviceAuthUrlEl = document.getElementById('deviceAuthUrl');
  var deviceAuthCodeEl = document.getElementById('deviceAuthCode');
  var copyUrlBtnEl = document.getElementById('copyUrlBtn');
  var copyCodeBtnEl = document.getElementById('copyCodeBtn');
  var deviceAuthCancelBtnEl = document.getElementById('deviceAuthCancelBtn');
  var deviceAuthSuccessEl = document.getElementById('deviceAuthSuccess');
  var deviceAuthErrorEl = document.getElementById('deviceAuthError');
  var deviceAuthEmailEl = document.getElementById('deviceAuthEmail');
  var deviceAuthErrorMsgEl = document.getElementById('deviceAuthErrorMsg');
  var deviceAuthRetryBtnEl = document.getElementById('deviceAuthRetryBtn');

  var currentDeviceAuthSession = null;
  var deviceAuthPollInterval = null;

  // Auth choices that support device code flow
  var DEVICE_AUTH_PROVIDERS = ['openai-codex', 'codex-cli'];

  function isDeviceAuthProvider(authChoice) {
    return DEVICE_AUTH_PROVIDERS.indexOf(authChoice) >= 0;
  }

  function showDeviceAuthCard(providerLabel) {
    if (deviceAuthCardEl) {
      deviceAuthCardEl.style.display = 'block';
      deviceAuthProviderNameEl.textContent = providerLabel || 'OpenAI Codex';
      deviceAuthStep1El.style.display = 'block';
      deviceAuthStep2El.style.display = 'none';
      deviceAuthStep3El.style.display = 'none';
      deviceAuthSuccessEl.style.display = 'none';
      deviceAuthErrorEl.style.display = 'none';
    }
  }

  function hideDeviceAuthCard() {
    if (deviceAuthCardEl) {
      deviceAuthCardEl.style.display = 'none';
    }
    stopDeviceAuthPolling();
    currentDeviceAuthSession = null;
  }

  function stopDeviceAuthPolling() {
    if (deviceAuthPollInterval) {
      clearInterval(deviceAuthPollInterval);
      deviceAuthPollInterval = null;
    }
  }

  // Show/hide device auth card when auth choice changes
  if (authChoiceEl) {
    var originalAuthChoiceHandler = authChoiceEl.onchange;
    authChoiceEl.onchange = function () {
      // Call existing handler first (handles __show_all__)
      if (originalAuthChoiceHandler) {
        originalAuthChoiceHandler.call(this);
      }

      var selectedChoice = authChoiceEl.value;
      if (isDeviceAuthProvider(selectedChoice)) {
        var label = selectedChoice;
        for (var i = 0; i < authChoiceEl.options.length; i++) {
          if (authChoiceEl.options[i].value === selectedChoice) {
            label = authChoiceEl.options[i].textContent;
            break;
          }
        }
        showDeviceAuthCard(label);
      } else {
        hideDeviceAuthCard();
      }
    };
  }

  // Start device auth flow
  if (deviceAuthStartBtnEl) {
    deviceAuthStartBtnEl.onclick = async function () {
      deviceAuthStartBtnEl.disabled = true;
      deviceAuthStartBtnEl.textContent = 'Starting...';

      try {
        var resp = await httpJson('/setup/api/device-auth/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!resp.ok) {
          throw new Error(resp.error || 'Failed to start device auth');
        }

        currentDeviceAuthSession = resp.sessionId;
        deviceAuthUrlEl.href = resp.verificationUrl;
        deviceAuthUrlEl.textContent = resp.verificationUrl;
        deviceAuthCodeEl.textContent = resp.userCode;

        // Show step 2
        deviceAuthStep1El.style.display = 'none';
        deviceAuthStep2El.style.display = 'block';

        // Start polling
        startDeviceAuthPolling();

      } catch (e) {
        showDeviceAuthError(String(e));
      } finally {
        deviceAuthStartBtnEl.disabled = false;
        deviceAuthStartBtnEl.textContent = 'Get Sign-in Code';
      }
    };
  }

  // Copy buttons
  if (copyUrlBtnEl) {
    copyUrlBtnEl.onclick = function () {
      navigator.clipboard.writeText(deviceAuthUrlEl.href);
      copyUrlBtnEl.textContent = 'Copied!';
      setTimeout(function () { copyUrlBtnEl.textContent = 'Copy'; }, 1500);
    };
  }
  if (copyCodeBtnEl) {
    copyCodeBtnEl.onclick = function () {
      navigator.clipboard.writeText(deviceAuthCodeEl.textContent);
      copyCodeBtnEl.textContent = 'Copied!';
      setTimeout(function () { copyCodeBtnEl.textContent = 'Copy Code'; }, 1500);
    };
  }

  // Cancel
  if (deviceAuthCancelBtnEl) {
    deviceAuthCancelBtnEl.onclick = async function () {
      stopDeviceAuthPolling();
      if (currentDeviceAuthSession) {
        try {
          await httpJson('/setup/api/device-auth/cancel', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: currentDeviceAuthSession }),
          });
        } catch (e) {
          console.warn('Cancel failed:', e);
        }
      }
      hideDeviceAuthCard();
      // Re-show step 1
      showDeviceAuthCard();
    };
  }

  // Retry
  if (deviceAuthRetryBtnEl) {
    deviceAuthRetryBtnEl.onclick = function () {
      deviceAuthStep1El.style.display = 'block';
      deviceAuthStep2El.style.display = 'none';
      deviceAuthStep3El.style.display = 'none';
      currentDeviceAuthSession = null;
    };
  }

  function showDeviceAuthError(msg) {
    deviceAuthStep1El.style.display = 'none';
    deviceAuthStep2El.style.display = 'none';
    deviceAuthStep3El.style.display = 'block';
    deviceAuthSuccessEl.style.display = 'none';
    deviceAuthErrorEl.style.display = 'block';
    deviceAuthErrorMsgEl.textContent = msg;
  }

  function startDeviceAuthPolling() {
    stopDeviceAuthPolling();

    var pollCount = 0;
    var maxPolls = 200; // ~5 minutes at 1.5s interval (backup timeout)

    deviceAuthPollInterval = setInterval(async function () {
      pollCount++;
      if (pollCount > maxPolls) {
        stopDeviceAuthPolling();
        showDeviceAuthError('Polling timeout. Please try again.');
        return;
      }

      if (!currentDeviceAuthSession) {
        stopDeviceAuthPolling();
        return;
      }

      try {
        var resp = await httpJson(
          '/setup/api/device-auth/status?session=' + currentDeviceAuthSession
        );

        if (resp.status === 'done') {
          stopDeviceAuthPolling();
          deviceAuthStep2El.style.display = 'none';
          deviceAuthStep3El.style.display = 'block';
          deviceAuthSuccessEl.style.display = 'block';
          deviceAuthEmailEl.textContent = resp.result?.email || 'Unknown';

          // Refresh main status after a moment
          setTimeout(function () {
            refreshStatus();
            hideDeviceAuthCard();
          }, 2000);

        } else if (resp.status === 'error') {
          stopDeviceAuthPolling();
          showDeviceAuthError(resp.error || 'Authentication failed');
        }
        // else: still polling, continue

      } catch (e) {
        console.warn('Poll error:', e);
        // Don't stop polling on transient errors
      }
    }, 1500);
  }

  // Load auth groups immediately (fast endpoint)
  loadAuthGroups();

  // Load status (slower, but needed for version info)
  refreshStatus();
})();
