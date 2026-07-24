// ---------------------------------------------------------------
// SESSION & UI TAB LOGIC
// ---------------------------------------------------------------
const session = JSON.parse(localStorage.getItem('voltguard_session') || 'null');
if (!session) {
    window.location.href = 'login.html';
}

window.addEventListener('DOMContentLoaded', () => {
    const brand = document.querySelector('.brand');
    if (brand && session) {
        const userBar = document.createElement('div');
        userBar.className = 'user-bar';
        userBar.innerHTML = `
            <span class="user-name">👤 ${session.name}</span>
            <button class="logout-btn" onclick="handleLogout()">⏻ Sign Out</button>
        `;
        brand.parentElement.insertBefore(userBar, brand.nextSibling);
    }
    renderVehicleOverview();
});

// ---------------------------------------------------------------
// VEHICLE / FLEET OVERVIEW (account-type aware)
// ---------------------------------------------------------------
function renderVehicleOverview() {
    const container = document.getElementById('vehicle-overview-container');
    if (!container || !session) return;

    if (session.accountType === 'fleet') {
        const fleetName = session.fleetName || 'Your Fleet';
        const fleetSize = session.fleetSize || 1;
        const extraVehicles = Math.max(0, fleetSize - 1);

        let rows = `
            <tr class="live-row" id="fleet-row-live">
                <td>EV-01 (Live)</td>
                <td>ESP32 Gateway Vehicle</td>
                <td id="fleet-live-soc">--%</td>
                <td id="fleet-live-voltage">-- V</td>
                <td id="fleet-live-temp">-- °C</td>
                <td><span id="fleet-live-status" class="fleet-status-pill pending">Connecting…</span></td>
            </tr>`;

        for (let i = 1; i <= extraVehicles; i++) {
            rows += `
            <tr>
                <td>EV-${String(i + 1).padStart(2, '0')}</td>
                <td>Awaiting Gateway</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td><span class="fleet-status-pill pending">No Gateway</span></td>
            </tr>`;
        }

        container.innerHTML = `
            <div class="fleet-table-wrap">
                <table class="fleet-table">
                    <thead>
                        <tr><th>Vehicle</th><th>Model / Notes</th><th>SOC</th><th>Voltage</th><th>Temp</th><th>Status</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p style="font-size:12.5px; color:rgba(255,255,255,0.4); margin: -12px 0 20px 4px;">
                Managing <strong>${fleetName}</strong> — ${fleetSize} vehicle${fleetSize === 1 ? '' : 's'} registered.
                Only vehicles with a connected ESP32 gateway report live data; the rest will populate as gateways come online.
            </p>`;
    } else {
        const vehicleModel = session.vehicleModel || 'Your EV';
        container.innerHTML = `
            <div class="vehicle-overview-card">
                <div class="vehicle-icon">
                    <svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" width="34" height="34">
                        <path d="M6 26 L10 14 Q12 9 18 9 L42 9 Q48 9 50 14 L54 26 L58 26 Q60 26 60 28 L60 31 Q60 33 58 33 L54 33 Q54 37 50 37 Q46 37 46 33 L18 33 Q18 37 14 37 Q10 37 10 33 L6 33 Q4 33 4 31 L4 28 Q4 26 6 26 Z"
                              fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
                        <path d="M14 25 L16 15 Q17 12 20 12 L40 12 Q43 12 44 15 L46 25 Z"
                              fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round" opacity="0.85"/>
                        <line x1="30" y1="12" x2="30" y2="25" stroke="#ffffff" stroke-width="1.4" opacity="0.85"/>
                        <circle cx="16" cy="33" r="3.4" fill="none" stroke="#ffffff" stroke-width="1.8"/>
                        <circle cx="48" cy="33" r="3.4" fill="none" stroke="#ffffff" stroke-width="1.8"/>
                    </svg>
                </div>
                <div class="vehicle-overview-details">
                    <h3>${vehicleModel}</h3>
                    <p>Owner: ${session.name} · Single Vehicle Monitoring</p>
                </div>
            </div>`;
    }
}

function handleLogout() {
    localStorage.removeItem('voltguard_session');
    window.location.href = 'login.html';
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const selectedButton = Array.from(document.querySelectorAll('.nav-item')).find(btn => btn.getAttribute('onclick').includes(tabId));
    if (selectedButton) selectedButton.classList.add('active');
    
    const targetPanel = document.getElementById(tabId);
    if (targetPanel) targetPanel.classList.add('active');
}

// ---------------------------------------------------------------
// CONNECTION STATUS UI INDICATORS
// ---------------------------------------------------------------
function setConnectedState(isConnected, modeName = "ESP32 Gateway") {
    const indicator = document.getElementById('conn-indicator');
    const text = document.getElementById('conn-text');
    if (indicator && text) {
        if (isConnected) {
            indicator.style.background = '#22c55e';
            indicator.style.boxShadow = '0 0 8px #22c55e';
            text.innerText = `Connected to ${modeName} (Receiving Data)`;
        } else {
            indicator.style.background = '#ef4444';
            indicator.style.boxShadow = '0 0 8px #ef4444';
            text.innerText = `Disconnected from ESP32`;
        }
    }
}

// ---------------------------------------------------------------
// 1. RECEIVE VIA WI-FI MQTT (WEBSOCKETS ON PORT 8884)
// ---------------------------------------------------------------
const MQTT_TOPIC = "voltguard/telemetry/data";
const client = new Paho.MQTT.Client(
    "broker.hivemq.com",
    Number(8884),
    "voltguard_web_" + Math.floor(Math.random() * 10000)
);

client.onConnectionLost = (responseObject) => {
    setConnectedState(false);
    if (responseObject.errorCode !== 0) {
        console.warn("MQTT Lost connection:", responseObject.errorMessage);
        setTimeout(reconnectMQTT, 3000);
    }
};

client.onMessageArrived = (message) => {
    try {
        const telemetry = JSON.parse(message.payloadString);
        setConnectedState(true, "ESP32 via Wi-Fi (MQTT)");
        processTelemetry(telemetry);
    } catch (e) {
        console.error("Malformed JSON received from ESP32:", e);
    }
};

function onMQTTConnect() {
    console.log("[MQTT] Connected to HiveMQ WebSocket Broker.");
    setConnectedState(true, "ESP32 Wi-Fi Broker");
    client.subscribe(MQTT_TOPIC);
}

function reconnectMQTT() {
    client.connect({
        onSuccess: onMQTTConnect,
        useSSL: true,
        cleanSession: true,
        onFailure: (err) => {
            console.error("[MQTT] Connection Failed:", err);
            setConnectedState(false);
        }
    });
}

// Initial connection attempt on page load
reconnectMQTT();

// ---------------------------------------------------------------
// 2. RECEIVE VIA WEB BLUETOOTH (BLE DIRECT)
// ---------------------------------------------------------------
let bleDevice;

async function connectBLE() {
    try {
        console.log("Searching for ESP32 Bluetooth device...");
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'VoltGuard' }, { namePrefix: 'ESP32' }],
            optionalServices: ['0000ff00-0000-1000-8000-00805f9b34fb']
        });

        const server = await bleDevice.gatt.connect();
        setConnectedState(true, "ESP32 Direct Bluetooth");

        bleDevice.addEventListener('gattserverdisconnected', () => setConnectedState(false));

        const services = await server.getPrimaryServices();
        if (services.length > 0) {
            const characteristics = await services[0].getCharacteristics();
            if (characteristics.length > 0) {
                await characteristics[0].startNotifications();
                characteristics[0].addEventListener('characteristicvaluechanged', (event) => {
                    const decoder = new TextDecoder('utf-8');
                    const jsonStr = decoder.decode(event.target.value);
                    try {
                        const telemetry = JSON.parse(jsonStr);
                        processTelemetry(telemetry);
                    } catch (e) {
                        console.warn("Raw BLE Packet:", jsonStr);
                    }
                });
            }
        }
    } catch (error) {
        console.error("BLE Pairing Error:", error);
        alert("Bluetooth connection failed: " + error.message);
    }
}

// ---------------------------------------------------------------
// 3. TELEMETRY ANALYTICS & UI DISPATCHER ENGINE
// ---------------------------------------------------------------
const V_MAX = 4.2, V_MIN = 3.0, TEMP_REF = 25;
let cumulativeDegradation = 0, cycleCount = 0, prevVoltage = null;

// ---------------------------------------------------------------
// CONFIGURABLE SAFETY THRESHOLDS & PACK RATING
// Adjust these to match the exact BMS/pack this dashboard is wired to.
// If the ESP32 payload includes its own fields (e.g. capacityAh,
// maxCurrent), those reported values are used instead automatically.
// ---------------------------------------------------------------
const RATED_CYCLE_LIFE   = 1500;   // total charge cycles before 80% SOH replacement point
const DEFAULT_CAPACITY_AH = 20;    // fallback pack capacity (Ah) if ESP32 doesn't report one
const MAX_SAFE_CURRENT    = 20;    // amps
const TEMP_WARN           = 40;    // °C — thermal caution
const TEMP_DANGER         = 50;    // °C — thermal danger
const TEMP_COLD_WARN      = 0;     // °C — cold-weather caution
const SOC_LOW             = 20;    // % — low charge warning
const SOC_CRITICAL        = 8;     // % — critical low charge
const FASTCHARGE_TEMP_MIN = 10;    // °C — below this, fast charging is not advised
const FASTCHARGE_TEMP_MAX = 35;    // °C — above this, fast charging is not advised
const FASTCHARGE_SOC_CAP  = 80;    // % — fast charging loses its benefit above this SOC

// Breakdown of the last SOH calculation, kept around so the SOH tab
// can display *why* the score is what it is, not just the number.
let lastSOHBreakdown = { voltageScore: 0, socScore: 0, degradationPenalty: 0 };

function calculateSOH(voltage, temperature, batteryLevel) {
    const voltageRatio = Math.min(Math.max(((voltage - V_MIN) / (V_MAX - V_MIN)) * 100, 0), 100);
    const tempDelta = temperature - TEMP_REF;
    const arrheniusFactor = Math.pow(2, tempDelta / 10);
    cumulativeDegradation += Math.max(0, (arrheniusFactor - 1) * 0.001);

    if (prevVoltage !== null && voltage > prevVoltage + 0.05) {
        cycleCount++;
        cumulativeDegradation += (100 / RATED_CYCLE_LIFE);
    }
    prevVoltage = voltage;

    const voltageScore = voltageRatio * 0.50;
    const socScore = batteryLevel * 0.35;
    const degradationPenalty = cumulativeDegradation * 0.15;

    lastSOHBreakdown = { voltageScore, socScore, degradationPenalty };

    const rawSOH = voltageScore + socScore - degradationPenalty;
    return Math.max(0, Math.min(100, rawSOH)).toFixed(1);
}

function calculateRUL(wearHealth, temperature) {
    const healthRemaining = Math.max(0, parseFloat(wearHealth) - 80);
    const thermalAccel = Math.pow(2, (temperature - TEMP_REF) / 10);
    const rulYears = ((healthRemaining / 20) * 5) / thermalAccel;
    return Math.max(0, rulYears).toFixed(2);
}

// RUL needs a health number that moves slowly with real accumulated wear
// (cycles + heat exposure), not one that swings with whatever the charge
// level happens to be right now. calculateSOH() above intentionally blends
// in instantaneous voltage/SOC for the Battery Health / SOH tabs, which
// means it rarely sits above 80 unless the pack is nearly fully charged —
// feeding that into RUL made "Remaining Useful Life" read 0.00 years
// almost all the time. This tracks wear only, so RUL stays meaningful
// across the whole charge range.
function calculateWearHealth() {
    return Math.max(0, Math.min(100, 100 - (cumulativeDegradation * 0.15))).toFixed(1);
}

// Grade helper shared by Battery Health / SOH tabs
function getGrade(value) {
    const v = parseFloat(value);
    if (v >= 90) return { label: 'Excellent', css: 'grade-excellent' };
    if (v >= 75) return { label: 'Good', css: 'grade-good' };
    if (v >= 60) return { label: 'Fair', css: 'grade-fair' };
    if (v >= 40) return { label: 'Poor', css: 'grade-poor' };
    return { label: 'Critical', css: 'grade-critical' };
}

function setSwitchChip(dotId, textId, value, onLabel = 'ON', offLabel = 'OFF') {
    const dot = document.getElementById(dotId);
    const text = document.getElementById(textId);
    if (!dot || !text) return;
    dot.classList.remove('on', 'off', 'warn');
    if (value === true) {
        dot.classList.add('on');
        text.innerText = onLabel;
    } else if (value === false) {
        dot.classList.add('off');
        text.innerText = offLabel;
    } else {
        dot.classList.add('off');
        text.innerText = 'Not reported';
    }
}

function setCheckItem(iconId, detailId, level, detailText) {
    const icon = document.getElementById(iconId);
    const detail = document.getElementById(detailId);
    if (!icon || !detail) return;
    icon.classList.remove('ok', 'warn', 'bad');
    icon.classList.add(level);
    icon.innerText = level === 'ok' ? '✓' : level === 'warn' ? '!' : '✕';
    detail.innerText = detailText;
}

function formatHoursMinutes(hoursDecimal) {
    if (!isFinite(hoursDecimal) || hoursDecimal <= 0) return '--';
    const totalMinutes = Math.round(hoursDecimal * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}H ${m}M`;
}

function processTelemetry(data) {
    // Extract raw payload sent by ESP32 JSON
    const voltage     = parseFloat(data.voltage || 0);
    const temperature = parseFloat(data.temperature || 0);
    const soc         = parseInt(data.soc || 0);

    // Extra fields — used if the ESP32/BMS reports them, otherwise
    // derived or shown as "not reported" rather than invented.
    const current      = data.current !== undefined ? parseFloat(data.current) : null;
    const power         = data.power !== undefined ? parseFloat(data.power) : (current !== null ? voltage * current : null);
    const cycles        = data.cycles !== undefined ? parseInt(data.cycles) : cycleCount;
    const chgMos        = typeof data.chgMos === 'boolean' ? data.chgMos : null;
    const disMos        = typeof data.disMos === 'boolean' ? data.disMos : null;
    const balState      = typeof data.balState === 'boolean' ? data.balState : null;
    const heatState     = typeof data.heatState === 'boolean' ? data.heatState : null;
    const capacityAh     = data.capacityAh !== undefined ? parseFloat(data.capacityAh) : DEFAULT_CAPACITY_AH;

    const status = data.status || (temperature > TEMP_DANGER ? "DANGER" : temperature > TEMP_WARN ? "WARNING" : "NORMAL");

    // 1. Update Realtime Metrics Tab
    const vEl = document.getElementById("main-voltage");
    const tEl = document.getElementById("main-temp");
    const sEl = document.getElementById("main-soc");
    if (vEl) vEl.innerText = `${voltage.toFixed(2)} V`;
    if (tEl) tEl.innerText = `${temperature.toFixed(1)} °C`;
    if (sEl) sEl.innerText = `${soc} %`;

    const curEl = document.getElementById("main-current");
    const powEl = document.getElementById("main-power");
    const cycEl = document.getElementById("main-cycles");
    if (curEl) curEl.innerText = current !== null ? `${current.toFixed(2)} A` : "-- A";
    if (powEl) powEl.innerText = power !== null ? `${power.toFixed(2)} W` : "-- W";
    if (cycEl) cycEl.innerText = `${cycles}`;

    setSwitchChip('chip-chgmos', 'chgmos-text', chgMos);
    setSwitchChip('chip-dismos', 'dismos-text', disMos);
    setSwitchChip('chip-balance', 'balance-text', balState, 'Active', 'Idle');
    setSwitchChip('chip-heat', 'heat-text', heatState, 'Active', 'Idle');

    const statusBanner = document.getElementById('battery-status-banner');
    if (statusBanner) {
        statusBanner.classList.remove('warn', 'danger');
        let msg = data.batteryMessage;
        if (!msg) {
            if (soc <= SOC_CRITICAL) { msg = '⚠ Critically low battery — charge immediately.'; statusBanner.classList.add('danger'); }
            else if (soc <= SOC_LOW) { msg = '⚠ Low battery, please charge soon.'; statusBanner.classList.add('warn'); }
            else if (temperature > TEMP_DANGER) { msg = '⚠ Pack overheating — reduce load and let it cool.'; statusBanner.classList.add('danger'); }
            else if (temperature > TEMP_WARN) { msg = '⚠ Pack running warm — monitor closely.'; statusBanner.classList.add('warn'); }
            else { msg = '✓ Battery operating normally.'; }
        }
        statusBanner.innerText = msg;
    }

    // 2. Update Capacity Visualizer (Battery Health tab)
    const healthPctBar = document.getElementById("health-percentage");
    const fillBar = document.getElementById("battery-fill-bar");
    if (healthPctBar) healthPctBar.innerText = `${soc}%`;
    if (fillBar) fillBar.style.height = `${Math.min(100, Math.max(0, soc))}%`;

    const remainingEnergyWh = (voltage * capacityAh) * (soc / 100);
    const bhVoltage = document.getElementById('bh-voltage');
    const bhEnergy = document.getElementById('bh-remaining-energy');
    const bhCycles = document.getElementById('bh-cycles');
    const bhGrade = document.getElementById('bh-grade');
    const bhTip = document.getElementById('bh-tip');
    if (bhVoltage) bhVoltage.innerText = `${voltage.toFixed(2)} V`;
    if (bhEnergy) bhEnergy.innerText = `≈ ${remainingEnergyWh.toFixed(1)} Wh`;
    if (bhCycles) bhCycles.innerText = `${cycles} / ${RATED_CYCLE_LIFE} rated`;

    // 3. Perform Edge SOH & RUL Computation
    const soh = calculateSOH(voltage, temperature, soc);
    const wearHealth = calculateWearHealth();
    const rul = calculateRUL(wearHealth, temperature);
    const grade = getGrade(soh);

    if (bhGrade) { bhGrade.innerText = grade.label; bhGrade.className = `grade-badge ${grade.css}`; }
    if (bhTip) {
        if (soc <= SOC_LOW) bhTip.innerText = 'Charge level is low — plug in soon to avoid deep discharge, which accelerates capacity loss.';
        else if (temperature > TEMP_WARN) bhTip.innerText = 'The pack is running warm. Let it cool before drawing heavy load or fast charging.';
        else bhTip.innerText = 'Capacity looks healthy. Avoid frequent full discharges to keep long-term capacity high.';
    }

    const sohEl = document.getElementById("soh-value");
    const rulEl = document.getElementById("rul-value");
    if (sohEl) sohEl.innerText = `${soh}%`;
    if (rulEl) rulEl.innerText = `${rul} Years`;

    const sohRingLabel = document.getElementById('soh-ring-label');
    if (sohRingLabel) sohRingLabel.innerText = `${soh}%`;

    const sohVoltageScore = document.getElementById('soh-voltage-score');
    const sohSocScore = document.getElementById('soh-soc-score');
    const sohDegradation = document.getElementById('soh-degradation');
    const sohGrade = document.getElementById('soh-grade');
    const sohTip = document.getElementById('soh-tip');
    if (sohVoltageScore) sohVoltageScore.innerText = `+${lastSOHBreakdown.voltageScore.toFixed(1)} pts`;
    if (sohSocScore) sohSocScore.innerText = `+${lastSOHBreakdown.socScore.toFixed(1)} pts`;
    if (sohDegradation) sohDegradation.innerText = `-${lastSOHBreakdown.degradationPenalty.toFixed(2)} pts`;
    if (sohGrade) { sohGrade.innerText = grade.label; sohGrade.className = `grade-badge ${grade.css}`; }
    if (sohTip) {
        if (grade.label === 'Excellent' || grade.label === 'Good') sohTip.innerText = 'Health is in a good range. Continue normal use and moderate charge/discharge cycling.';
        else if (grade.label === 'Fair') sohTip.innerText = 'Some wear detected. Reduce fast charging and avoid extreme temperatures to slow further decline.';
        else sohTip.innerText = 'Significant wear detected. Consider a professional inspection and avoid deep discharge or high-current draw.';
    }

    const thermalAccel = Math.pow(2, (temperature - TEMP_REF) / 10);
    const cyclesRemaining = Math.max(0, RATED_CYCLE_LIFE - cycles);
    const rulCurrentSoh = document.getElementById('rul-current-soh');
    const rulThermalFactor = document.getElementById('rul-thermal-factor');
    const rulCyclesRemaining = document.getElementById('rul-cycles-remaining');
    const rulTip = document.getElementById('rul-tip');
    if (rulCurrentSoh) rulCurrentSoh.innerText = `${wearHealth}%`;
    if (rulThermalFactor) rulThermalFactor.innerText = `${thermalAccel.toFixed(2)}×`;
    if (rulCyclesRemaining) rulCyclesRemaining.innerText = `≈ ${cyclesRemaining} cycles`;
    if (rulTip) {
        if (temperature > TEMP_WARN) rulTip.innerText = 'Elevated temperature is accelerating wear right now — cooling the pack will directly extend RUL.';
        else if (parseFloat(rul) < 1) rulTip.innerText = 'Projected life is short at the current SOH. Plan for pack service or replacement soon.';
        else rulTip.innerText = 'Keeping the pack cooler and avoiding deep discharge cycles both extend the projected RUL.';
    }

    // 4. Risk Evaluation — individual checks + overall level
    const voltageNearLimit = voltage <= V_MIN + 0.15 || voltage >= V_MAX - 0.1;
    let voltageLevel = 'ok', voltageDetail = `Within safe range (${V_MIN}V–${V_MAX}V).`;
    if (voltage < V_MIN) { voltageLevel = 'bad'; voltageDetail = `Below safe minimum (${voltage.toFixed(2)}V < ${V_MIN}V) — undervoltage risk.`; }
    else if (voltage > V_MAX) { voltageLevel = 'bad'; voltageDetail = `Above safe maximum (${voltage.toFixed(2)}V > ${V_MAX}V) — overvoltage risk.`; }
    else if (voltageNearLimit) { voltageLevel = 'warn'; voltageDetail = `Close to the safe voltage limit (${voltage.toFixed(2)}V).`; }

    let tempLevel = 'ok', tempDetail = `Operating temperature normal (${temperature.toFixed(1)}°C).`;
    if (temperature > TEMP_DANGER) { tempLevel = 'bad'; tempDetail = `Critical overheating (${temperature.toFixed(1)}°C > ${TEMP_DANGER}°C).`; }
    else if (temperature > TEMP_WARN) { tempLevel = 'warn'; tempDetail = `Running warm (${temperature.toFixed(1)}°C > ${TEMP_WARN}°C).`; }
    else if (temperature < TEMP_COLD_WARN) { tempLevel = 'warn'; tempDetail = `Running cold (${temperature.toFixed(1)}°C) — charge more slowly.`; }

    let currentLevel = 'ok', currentDetail = current !== null ? `Draw of ${current.toFixed(1)}A is within the ${MAX_SAFE_CURRENT}A safe limit.` : 'Current not reported by BMS.';
    if (current !== null) {
        if (Math.abs(current) > MAX_SAFE_CURRENT) { currentLevel = 'bad'; currentDetail = `Draw of ${current.toFixed(1)}A exceeds the ${MAX_SAFE_CURRENT}A safe limit.`; }
        else if (Math.abs(current) > MAX_SAFE_CURRENT * 0.8) { currentLevel = 'warn'; currentDetail = `Draw of ${current.toFixed(1)}A is approaching the ${MAX_SAFE_CURRENT}A limit.`; }
    }

    let socLevel = 'ok', socDetail = `Charge level healthy (${soc}%).`;
    if (soc <= SOC_CRITICAL) { socLevel = 'bad'; socDetail = `Critically low charge (${soc}%) — risk of deep discharge.`; }
    else if (soc <= SOC_LOW) { socLevel = 'warn'; socDetail = `Low charge (${soc}%) — charge soon.`; }

    setCheckItem('risk-check-voltage-icon', 'risk-check-voltage-detail', voltageLevel, voltageDetail);
    setCheckItem('risk-check-temp-icon', 'risk-check-temp-detail', tempLevel, tempDetail);
    setCheckItem('risk-check-current-icon', 'risk-check-current-detail', currentLevel, currentDetail);
    setCheckItem('risk-check-soc-icon', 'risk-check-soc-detail', socLevel, socDetail);

    const levels = [voltageLevel, tempLevel, currentLevel, socLevel];
    const overallLevel = levels.includes('bad') ? 'bad' : levels.includes('warn') ? 'warn' : 'ok';
    const riskEl = document.getElementById("risk-level-text");
    const riskBox = document.getElementById('risk-visual-box');
    const riskTip = document.getElementById('risk-tip');
    const riskLabel = data.status ? `${data.status} RISK` : (overallLevel === 'bad' ? 'HIGH RISK' : overallLevel === 'warn' ? 'MODERATE RISK' : 'LOW RISK');
    if (riskEl) riskEl.innerText = riskLabel;
    if (riskBox) riskBox.style.background = overallLevel === 'bad' ? '#ef4444' : overallLevel === 'warn' ? '#eab308' : '#22c55e';
    if (riskTip) {
        if (overallLevel === 'bad') riskTip.innerText = 'One or more checks are outside safe limits. Reduce load and inspect the pack before continued use.';
        else if (overallLevel === 'warn') riskTip.innerText = 'Everything is operable but at least one reading is close to a limit — keep an eye on it.';
        else riskTip.innerText = 'All monitored parameters are within their safe operating ranges.';
    }

    // 5. AI Diagnostics — itemised checks
    const voltageJump = prevVoltage !== null ? Math.abs(voltage - prevVoltage) : 0;
    setCheckItem('ai-check-thermal-icon', 'ai-check-thermal-detail', tempLevel,
        tempLevel === 'ok' ? 'Thermal profile stable and within optimal band.' : tempDetail);
    setCheckItem('ai-check-voltage-icon', 'ai-check-voltage-detail', voltageJump > 0.3 ? 'warn' : 'ok',
        voltageJump > 0.3 ? `Voltage moved ${voltageJump.toFixed(2)}V between readings — check for a loose connection or heavy load.` : 'Voltage trend is smooth and stable.');
    setCheckItem('ai-check-balance-icon', 'ai-check-balance-detail', balState === null ? 'warn' : 'ok',
        balState === null ? 'Cell balancing status not reported by BMS.' : (balState ? 'Cells are actively balancing.' : 'Cells are balanced — no action needed.'));
    setCheckItem('ai-check-mos-icon', 'ai-check-mos-detail', (chgMos === false && disMos === false) ? 'bad' : 'ok',
        (chgMos === false && disMos === false) ? 'Both charge and discharge MOSFETs are open — pack is isolated.' : 'MOSFET switching behaving as expected.');

    const aiEl = document.getElementById("ai-verdict");
    const aiTip = document.getElementById('ai-tip');
    if (aiEl) aiEl.innerText = overallLevel === 'bad' ? 'ALERT: Immediate Attention Recommended' : overallLevel === 'warn' ? 'ALERT: Thermal Throttling Recommended' : 'Optimal Operating Conditions';
    if (aiTip) {
        if (overallLevel === 'bad') aiTip.innerText = 'Multiple readings are abnormal. Stop heavy discharge and have the pack inspected.';
        else if (overallLevel === 'warn') aiTip.innerText = 'A reading is trending toward its limit. Reduce load or charging rate until it stabilizes.';
        else aiTip.innerText = 'No anomalies detected across thermal, electrical or balancing checks.';
    }

    // 6. Smart Charging Recommendation
    const chargeRecEl = document.getElementById("charge-recommendation");
    if (chargeRecEl) {
        if (temperature > TEMP_WARN) {
            chargeRecEl.innerText = "⛔ Thermal Warning: Delay Charging";
        } else if (soc >= 100) {
            chargeRecEl.innerText = "✅ Battery Fully Charged";
        } else if (soc > 80) {
            chargeRecEl.innerText = "⚡ Trickle Charging Mode";
        } else {
            chargeRecEl.innerText = "⚡ Rapid Charge Safe";
        }
    }

    const chargeTimeEl = document.getElementById('charge-time-to-full');
    const chargeRateEl = document.getElementById('charge-rate-suggestion');
    const chargeMosEl = document.getElementById('charge-mos-status');
    const chargeTempEl = document.getElementById('charge-temp-readout');
    const chargingTip = document.getElementById('charging-tip');

    if (chargeTimeEl) {
        if (current !== null && current > 0 && soc < 100) {
            const remainingAh = capacityAh * (100 - soc) / 100;
            chargeTimeEl.innerText = formatHoursMinutes(remainingAh / current);
        } else if (soc >= 100) {
            chargeTimeEl.innerText = 'Full';
        } else {
            chargeTimeEl.innerText = 'N/A (not charging)';
        }
    }
    if (chargeRateEl) {
        if (temperature > TEMP_WARN) chargeRateEl.innerText = '~0.2C (reduced, hot pack)';
        else if (soc > 80) chargeRateEl.innerText = '~0.1C (trickle)';
        else if (temperature < TEMP_COLD_WARN) chargeRateEl.innerText = '~0.2C (reduced, cold pack)';
        else chargeRateEl.innerText = '~0.5C (standard)';
    }
    if (chargeMosEl) chargeMosEl.innerText = chgMos === null ? 'Not reported' : (chgMos ? 'Enabled' : 'Disabled');
    if (chargeTempEl) chargeTempEl.innerText = `${temperature.toFixed(1)} °C`;
    if (chargingTip) {
        if (temperature > TEMP_WARN) chargingTip.innerText = 'Pack is too warm for fast charging. Let it cool below ' + TEMP_WARN + '°C before charging at full rate.';
        else if (soc > 80) chargingTip.innerText = 'Above 80% charge, trickle charging reduces stress on the cells — this is expected to slow down.';
        else chargingTip.innerText = 'For longest pack life, avoid charging above 40°C and try to keep the pack between 20–80% for daily use.';
    }

    // 7. Fast Charge Advisor — is fast charging suitable right now?
    const protectionActive = typeof status === 'string' && status.toUpperCase().indexOf('PROTECTION') !== -1;

    let fcTempLevel = 'ok', fcTempDetail = `${temperature.toFixed(1)}°C is within the ${FASTCHARGE_TEMP_MIN}–${FASTCHARGE_TEMP_MAX}°C fast-charge window.`;
    if (temperature > FASTCHARGE_TEMP_MAX) { fcTempLevel = 'bad'; fcTempDetail = `${temperature.toFixed(1)}°C exceeds the ${FASTCHARGE_TEMP_MAX}°C fast-charge limit.`; }
    else if (temperature < FASTCHARGE_TEMP_MIN) { fcTempLevel = 'bad'; fcTempDetail = `${temperature.toFixed(1)}°C is below the ${FASTCHARGE_TEMP_MIN}°C fast-charge minimum.`; }

    let fcSocLevel = 'ok', fcSocDetail = `${soc}% charge — fast charging is most effective below ${FASTCHARGE_SOC_CAP}%.`;
    if (soc >= 100) { fcSocLevel = 'bad'; fcSocDetail = 'Pack is already fully charged.'; }
    else if (soc >= FASTCHARGE_SOC_CAP) { fcSocLevel = 'warn'; fcSocDetail = `${soc}% charge is above ${FASTCHARGE_SOC_CAP}% — fast charging brings little benefit here.`; }

    let fcVoltLevel = 'ok', fcVoltDetail = `${voltage.toFixed(2)}V has healthy headroom below ${V_MAX}V.`;
    if (voltage >= V_MAX - 0.05) { fcVoltLevel = 'bad'; fcVoltDetail = `${voltage.toFixed(2)}V is at the ${V_MAX}V ceiling — fast charging risks overvoltage.`; }
    else if (voltage >= V_MAX - 0.15) { fcVoltLevel = 'warn'; fcVoltDetail = `${voltage.toFixed(2)}V is close to the ${V_MAX}V ceiling.`; }

    let fcMosLevel = 'ok', fcMosDetail = 'Charge MOSFET enabled and no protection faults active.';
    if (protectionActive) { fcMosLevel = 'bad'; fcMosDetail = `Active protection fault reported by BMS (${status}).`; }
    else if (chgMos === false) { fcMosLevel = 'bad'; fcMosDetail = 'Charge MOSFET is currently disabled by the BMS.'; }
    else if (chgMos === null) { fcMosLevel = 'warn'; fcMosDetail = 'Charge MOSFET state not reported by BMS.'; }

    setCheckItem('fc-check-temp-icon', 'fc-check-temp-detail', fcTempLevel, fcTempDetail);
    setCheckItem('fc-check-soc-icon', 'fc-check-soc-detail', fcSocLevel, fcSocDetail);
    setCheckItem('fc-check-voltage-icon', 'fc-check-voltage-detail', fcVoltLevel, fcVoltDetail);
    setCheckItem('fc-check-mos-icon', 'fc-check-mos-detail', fcMosLevel, fcMosDetail);

    const fcLevels = [fcTempLevel, fcSocLevel, fcVoltLevel, fcMosLevel];
    const fcOverall = fcLevels.includes('bad') ? 'no' : fcLevels.includes('warn') ? 'caution' : 'yes';

    const fcVerdictBox = document.getElementById('fastcharge-verdict');
    const fcIcon = document.getElementById('fc-icon');
    const fcVerdictText = document.getElementById('fc-verdict-text');
    const fcVerdictSubtext = document.getElementById('fc-verdict-subtext');
    const fcTip = document.getElementById('fc-tip');

    if (fcVerdictBox) {
        fcVerdictBox.classList.remove('caution', 'no');
        if (fcOverall === 'yes') {
            fcIcon.innerText = '⚡';
            fcVerdictText.innerText = 'Fast Charging Suitable';
            fcVerdictSubtext.innerText = 'All conditions support a fast charge right now.';
            fcTip.innerText = 'Conditions look good — a fast charger can be used safely until the pack nears 80%.';
        } else if (fcOverall === 'caution') {
            fcVerdictBox.classList.add('caution');
            fcIcon.innerText = '⚠️';
            fcVerdictText.innerText = 'Fast Charging Possible, With Caution';
            fcVerdictSubtext.innerText = 'At least one condition is borderline — monitor closely if fast charging.';
            fcTip.innerText = 'Fast charging will work, but keep an eye on the flagged condition above and switch to standard charging if it worsens.';
        } else {
            fcVerdictBox.classList.add('no');
            fcIcon.innerText = '⛔';
            fcVerdictText.innerText = 'Fast Charging Not Recommended';
            fcVerdictSubtext.innerText = 'Use standard/trickle charging instead until conditions improve.';
            fcTip.innerText = 'One or more conditions make fast charging unsafe right now — see the checklist above for what to fix first.';
        }
    }

    // 8. Live fleet-row update (fleet accounts only — no-op otherwise)
    const fleetSocEl = document.getElementById('fleet-live-soc');
    const fleetVoltEl = document.getElementById('fleet-live-voltage');
    const fleetTempEl = document.getElementById('fleet-live-temp');
    const fleetStatusEl = document.getElementById('fleet-live-status');
    if (fleetSocEl) fleetSocEl.innerText = `${soc}%`;
    if (fleetVoltEl) fleetVoltEl.innerText = `${voltage.toFixed(2)} V`;
    if (fleetTempEl) fleetTempEl.innerText = `${temperature.toFixed(1)} °C`;
    if (fleetStatusEl) {
        fleetStatusEl.classList.remove('pending', 'ok', 'warn', 'bad');
        fleetStatusEl.classList.add(overallLevel);
        fleetStatusEl.innerText = overallLevel === 'bad' ? 'High Risk' : overallLevel === 'warn' ? 'Caution' : 'Normal';
    }

    // ---------------------------------------------------------------
    // 9. Live snapshot for the AI Battery Assistant to reason over
    // ---------------------------------------------------------------
    window.latestBatteryState = {
        hasData: true,
        voltage, temperature, soc, current, power, cycles,
        chgMos, disMos, balState, heatState, capacityAh, status,
        soh: parseFloat(soh), wearHealth: parseFloat(wearHealth), rul: parseFloat(rul), grade: grade.label,
        riskLevel: overallLevel, fastChargeVerdict: fcOverall,
        cyclesRemaining, remainingEnergyWh, protectionActive
    };
}
// =================================================================
// HELP & SUPPORT — HELPLINE + AI BATTERY ASSISTANT
// =================================================================

// --- Popup menu (Call Helpline / AI Assistant) ---
function toggleHelpMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('help-menu');
    if (menu) menu.classList.toggle('open');
}

function closeHelpMenu() {
    const menu = document.getElementById('help-menu');
    if (menu) menu.classList.remove('open');
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('help-menu');
    const fab = document.getElementById('help-fab');
    if (menu && menu.classList.contains('open') && !menu.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
        closeHelpMenu();
    }
});

// --- Helpline modal ---
function openHelpline() {
    closeHelpMenu();
    const modal = document.getElementById('helpline-modal');
    if (modal) modal.classList.add('open');
}

function closeHelpline() {
    const modal = document.getElementById('helpline-modal');
    if (modal) modal.classList.remove('open');
}

function closeHelplineOnOverlay(e) {
    if (e.target.id === 'helpline-modal') closeHelpline();
}

// --- AI Battery Assistant chat panel ---
let aiChatStarted = false;

function openAIChat() {
    closeHelpMenu();
    const panel = document.getElementById('ai-chat-panel');
    if (panel) panel.classList.add('open');

    if (!aiChatStarted) {
        aiChatStarted = true;
        const firstName = (session && session.name) ? session.name.split(' ')[0] : 'there';
        appendChatMessage('bot',
            `Hi ${firstName}, I'm your AI Battery Assistant. I read your pack's live voltage, temperature, charge level, MOSFET and health data to help figure out what's going on and what to do about it.\n\nDescribe the problem you're seeing, or tap a suggestion below.`
        );
    }

    const input = document.getElementById('ai-chat-input');
    if (input) input.focus();
}

function closeAIChat() {
    const panel = document.getElementById('ai-chat-panel');
    if (panel) panel.classList.remove('open');
}

function appendChatMessage(sender, text) {
    const box = document.getElementById('ai-chat-messages');
    if (!box) return;
    const msg = document.createElement('div');
    msg.className = `ai-msg ${sender}`;
    msg.innerText = text;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
    return msg;
}

function askAIChip(text) {
    const input = document.getElementById('ai-chat-input');
    if (input) input.value = text;
    sendAIChatMessage();
}

function sendAIChatMessage() {
    const input = document.getElementById('ai-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    appendChatMessage('user', text);
    input.value = '';

    const box = document.getElementById('ai-chat-messages');
    const typing = document.createElement('div');
    typing.className = 'ai-msg bot ai-typing-wrap';
    typing.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;

    // Small delay makes the reply feel considered rather than instant/canned
    setTimeout(() => {
        typing.remove();
        appendChatMessage('bot', generateBatteryAIResponse(text));
    }, 450 + Math.random() * 400);
}

// -----------------------------------------------------------------
// Rule-based diagnostic engine. Reasons over window.latestBatteryState
// (populated live by processTelemetry) plus the same safety thresholds
// the rest of the dashboard uses, so its answers always match what the
// other tabs are showing.
// -----------------------------------------------------------------
// Builds a full live snapshot — used by the dedicated "status" topic
// and by the fallback below, so a battery/EV-mentioning question that
// doesn't match a specific symptom still gets real data back instead
// of a non-answer.
function buildStatusSummary(s) {
    if (!s || !s.hasData) {
        return `I don't have a live connection yet — connect the ESP32 gateway from the bar at the top of the dashboard and I can give you a full read on voltage, temperature, charge level, health and risk.`;
    }
    const riskWord = s.riskLevel === 'bad' ? 'needs attention' : s.riskLevel === 'warn' ? 'okay, but worth watching' : 'looking healthy';
    const lines = [
        `Here's how things stand right now:`,
        `• Charge: ${s.soc}%`,
        `• Voltage: ${s.voltage.toFixed(2)}V`,
        `• Temperature: ${s.temperature.toFixed(1)}°C`
    ];
    if (s.current !== null) lines.push(`• Current draw: ${s.current.toFixed(2)}A`);
    lines.push(`• State of Health: ${s.soh}% (${s.grade})`);
    lines.push(`• Estimated Remaining Life: ${s.rul} years`);
    lines.push(`• Overall risk: ${s.riskLevel.toUpperCase()} — ${riskWord}`);
    lines.push(``);
    lines.push(`Ask me about any of these specifically — charging, heat, range, health — and I can go deeper.`);
    return lines.join('\n');
}

function generateBatteryAIResponse(rawText) {
    const t = (rawText || '').toLowerCase();
    const s = window.latestBatteryState;
    const hasData = !!(s && s.hasData);

    const topics = [
        {
            name: 'overheat',
            keywords: ['hot', 'heat', 'overheat', 'warm', 'temperature', 'temp', 'thermal', 'burning', 'boiling', 'melting', 'smoke', 'smells burning', 'too hot', 'heating up', 'super hot'],
            handler: () => {
                if (!hasData) {
                    return `I don't have a live temperature reading yet — connect the ESP32 gateway from the bar at the top of the dashboard.\n\nIn general: this pack should stay under ${TEMP_WARN}°C for normal use. Above ${TEMP_DANGER}°C is a danger zone where charging and heavy load should stop immediately.`;
                }
                if (s.temperature > TEMP_DANGER) {
                    return `Your pack is at ${s.temperature.toFixed(1)}°C right now — above the ${TEMP_DANGER}°C danger threshold. That's a critical overheating condition.\n\nWhat to do:\n1. Stop charging and avoid hard acceleration immediately.\n2. Park in shade and let it cool passively — never pour water on it.\n3. Once it's back under ${TEMP_WARN}°C, check the Risk Evaluation and AI Diagnostics tabs for anything else flagged.\n4. If it keeps climbing back above ${TEMP_DANGER}°C on its own with no heavy use, that points to a cooling or cell-level fault — call the helpline instead of continuing to use it.`;
                }
                if (s.temperature > TEMP_WARN) {
                    return `Your pack is running warm at ${s.temperature.toFixed(1)}°C — above the ${TEMP_WARN}°C caution line but below the ${TEMP_DANGER}°C danger line, so it's not an emergency yet.\n\nLikely causes: fast charging, hard acceleration, hot ambient weather, or direct sun on the pack.\n\nWhat to do:\n1. Ease off fast charging and hard acceleration until it drops back under ${TEMP_WARN}°C.\n2. Park in shade where you can.\n3. Check the Smart Charging tab — it automatically suggests a reduced charge rate while the pack is warm.`;
                }
                return `Good news — your pack is at ${s.temperature.toFixed(1)}°C, comfortably inside the safe ${TEMP_COLD_WARN}–${TEMP_WARN}°C band, so there's no thermal issue right now.\n\nTo keep it that way: avoid parking in direct sun for long periods, avoid back-to-back fast-charge sessions, and give it a few minutes to cool after hard driving before plugging in.`;
            }
        },
        {
            name: 'fastcharge',
            keywords: ['fast charge', 'fast charging', 'rapid charge', 'rapid charging', 'quick charge', 'quick charging', 'supercharge', 'dc fast', 'dc charging', 'speed charge'],
            handler: () => {
                if (!hasData) {
                    return `Once telemetry is connected I can check this live, but generally fast charging is safest between ${FASTCHARGE_TEMP_MIN}–${FASTCHARGE_TEMP_MAX}°C, below ${FASTCHARGE_SOC_CAP}% charge, and with no active protection faults.`;
                }
                const v = s.fastChargeVerdict;
                let head;
                if (v === 'yes') head = `Yes — fast charging looks safe right now.`;
                else if (v === 'caution') head = `Fast charging is possible, but with caution.`;
                else head = `I wouldn't recommend fast charging right now.`;

                return `${head}\n\nCurrent readings: ${s.temperature.toFixed(1)}°C, ${s.soc}% charge, ${s.voltage.toFixed(2)}V.\n• Fast-charge temperature window: ${FASTCHARGE_TEMP_MIN}–${FASTCHARGE_TEMP_MAX}°C\n• Loses benefit above ${FASTCHARGE_SOC_CAP}% charge\n• Needs voltage headroom below ${V_MAX}V and Charge MOSFET enabled\n\nSee the Fast Charge Advisor tab for the full breakdown of which specific check is limiting it.`;
            }
        },
        {
            name: 'charging',
            keywords: ['charging', 'charge', 'plug', "won't charge", 'wont charge', 'not charging', 'stopped charging', 'slow charge', 'trickle', 'no charge', 'charger not working', 'charging issue', 'charging problem', 'stuck charging', 'charging stuck', "isn't charging", 'doesnt charge', "doesn't charge", 'refuses to charge', 'charge port', 'taking too long', 'charging takes long', 'charging slow', 'charge slowly'],
            handler: () => {
                if (!hasData) {
                    return `I don't have a live reading yet — connect the ESP32 gateway to see exactly why. In general, charging can slow or pause because the pack is too hot/cold, it's above 80% (trickle mode kicks in on purpose), or the BMS has disabled the Charge MOSFET due to a fault.`;
                }
                if (s.chgMos === false) {
                    return `Charging is currently disabled by the BMS — the Charge MOSFET is OFF.\n\nThis is usually the BMS protecting the pack from an overvoltage, overtemperature, or other fault condition rather than a charger problem.\n\nWhat to do:\n1. Check the Realtime Metrics tab for anything abnormal in voltage or temperature.\n2. Let the pack cool/rest for a few minutes, then try reconnecting.\n3. If the Charge MOSFET stays disabled with no clear trigger, that's worth a helpline call — it may need a manual BMS reset.`;
                }
                if (s.temperature > TEMP_WARN) {
                    return `Charging is likely slow or paused because the pack is at ${s.temperature.toFixed(1)}°C, above the ${TEMP_WARN}°C threshold — the BMS deliberately throttles charge current when it's warm to protect the cells.\n\nLet the pack cool below ${TEMP_WARN}°C (shade, rest, no load) and charging speed should recover on its own.`;
                }
                if (s.soc >= 100) {
                    return `Your pack shows ${s.soc}% — it's already fully charged, so there's nothing more to top up. No issue here.`;
                }
                if (s.soc > 80) {
                    return `At ${s.soc}% charge, the pack is intentionally in trickle-charging mode. Above 80%, charge current is reduced to protect the cells — this is expected behavior, not a fault, and is why it "feels" slow near the top.`;
                }
                return `Charging looks normal from here: ${s.soc}% charge, ${s.temperature.toFixed(1)}°C, Charge MOSFET enabled. Check the Smart Charging tab for the live estimated time to full and suggested rate. If it's still slower than you expect, it's worth checking the charger/cable itself rather than the pack.`;
            }
        },
        {
            name: 'drain',
            keywords: ['drain', 'draining', 'range', 'losing charge', 'dying', 'discharge fast', 'runs out', 'battery dying', 'drains fast', 'drains quickly', 'battery drops fast', 'losing battery fast', 'mileage', 'not lasting', "doesn't last", 'low range', 'range anxiety', 'less range', 'reduced range', 'range dropped', 'goes down fast', 'depleting fast'],
            handler: () => {
                if (!hasData) {
                    return `I don't have live data yet, but the usual causes of fast battery drain are: aggressive driving/high current draws, cold weather (capacity drops temporarily below ${TEMP_COLD_WARN}°C), accessories left on while parked, or genuine capacity loss from an aging pack.`;
                }
                const parts = [`Current charge level: ${s.soc}%.`];
                if (s.current !== null && Math.abs(s.current) > MAX_SAFE_CURRENT * 0.8) {
                    parts.push(`You're also drawing ${s.current.toFixed(1)}A, close to or above the ${MAX_SAFE_CURRENT}A safe limit — heavy current draw is the fastest way to burn through charge, and repeated high draws also accelerate long-term wear.`);
                }
                if (s.temperature < TEMP_COLD_WARN) {
                    parts.push(`It's also running cold at ${s.temperature.toFixed(1)}°C — cold packs temporarily deliver less usable range, which can feel like faster drain even though capacity itself hasn't changed.`);
                }
                if (s.grade === 'Poor' || s.grade === 'Critical') {
                    parts.push(`Your Battery Health grade is currently "${s.grade}" (${s.soh}% SOH) — some of what you're noticing may be genuine capacity loss rather than a temporary condition. Check the Battery Health and RUL tabs for the full picture.`);
                }
                parts.push(`Other things to rule out: accessories or systems left running while parked (parasitic drain), and aggressive acceleration habits.`);
                return parts.join('\n\n');
            }
        },
        {
            name: 'voltage',
            keywords: ['voltage', 'volt', 'volts', 'v drop', 'fluctuat', 'spike', 'undervoltage', 'overvoltage', 'unstable voltage', 'voltage drop', 'voltage issue', 'voltage jumping'],
            handler: () => {
                if (!hasData) {
                    return `I don't have a live voltage reading yet. This pack's safe operating window is ${V_MIN}V–${V_MAX}V — readings outside that range indicate under- or over-voltage risk.`;
                }
                const headroomLow = (s.voltage - V_MIN).toFixed(2);
                const headroomHigh = (V_MAX - s.voltage).toFixed(2);
                let assessment;
                if (s.voltage < V_MIN) assessment = `This is below the safe minimum — undervoltage risk. Avoid further discharge and charge it as soon as possible.`;
                else if (s.voltage > V_MAX) assessment = `This is above the safe maximum — overvoltage risk. Stop charging immediately and let it settle.`;
                else if (s.voltage <= V_MIN + 0.15) assessment = `You're close to the low end — plan to charge soon rather than continuing to draw it down.`;
                else if (s.voltage >= V_MAX - 0.1) assessment = `You're close to the top end — this is expected near a full charge and isn't a concern on its own.`;
                else assessment = `That's a healthy margin from both limits, so there's no voltage concern right now.`;

                return `Current pack voltage: ${s.voltage.toFixed(2)}V (safe range ${V_MIN}V–${V_MAX}V — that's ${headroomLow}V of headroom above the minimum and ${headroomHigh}V below the maximum).\n\n${assessment}\n\nIf you're seeing the number jump around a lot between readings rather than settle, that more often points to a loose connection or a heavy intermittent load than a cell problem — the AI Diagnostics tab flags voltage jumps over 0.3V between readings specifically.`;
            }
        },
        {
            name: 'health',
            keywords: ['health', 'degrade', 'degradation', 'capacity', 'wear', 'aging', 'old battery', 'soh', 'losing capacity', 'battery condition', 'is my battery good', 'is my battery ok', 'battery good or bad', 'lost capacity', 'state of health'],
            handler: () => {
                if (!hasData) {
                    return `I don't have live health data yet — connect the ESP32 gateway and check the Battery Health / State of Health (SOH) tabs for a full breakdown once it's online.`;
                }
                const gradeAdvice = {
                    'Excellent': `Your pack is in excellent shape. Keep doing what you're doing — moderate charge/discharge cycling and avoiding extremes is all it needs.`,
                    'Good': `Your pack is in good health. Continue normal use; nothing to change right now.`,
                    'Fair': `Some wear has accumulated. Reduce fast charging where you can, avoid extreme temperatures, and try to keep cycles between roughly 20–80% for daily driving.`,
                    'Poor': `Meaningful wear has been detected. Cut back on fast charging and high-current draws, avoid deep discharges, and keep an eye on the RUL tab for how much life remains before the 80% SOH replacement point.`,
                    'Critical': `Wear is significant. I'd recommend a professional inspection soon and avoiding deep discharge or heavy current draw in the meantime.`
                };
                return `State of Health: ${s.soh}% — graded "${s.grade}".\nEstimated Remaining Useful Life: ${s.rul} years, with roughly ${s.cyclesRemaining} charge cycles left before the 80% SOH replacement threshold.\n\n${gradeAdvice[s.grade] || ''}`;
            }
        },
        {
            name: 'balance',
            keywords: ['balance', 'balancing', 'imbalance', 'cell', 'cell voltage', 'cells uneven', 'imbalanced', 'uneven cells'],
            handler: () => {
                if (!hasData) return `Cell balancing status isn't available yet without a live connection. In general: active balancing during charge is normal and healthy; a pack that never balances, or one where individual cell voltages diverge a lot, is worth having checked.`;
                if (s.balState === null) return `Your BMS isn't reporting cell balancing status. This isn't necessarily a problem — some BMS units simply don't expose it — but if you're noticing shortened range or uneven performance, mention this to a technician when you call the helpline.`;
                if (s.balState) return `Cells are actively balancing right now — that's normal and expected, especially near the top of a charge. It means the BMS is evening out small differences between cells, which is healthy behavior, not a fault.`;
                return `Cells are balanced with no active balancing needed right now — that's a good sign of even cell health across the pack.`;
            }
        },
        {
            name: 'protection',
            keywords: ['mosfet', 'protection', 'fault', 'tripped', 'cutoff', 'cut off', "won't turn on", 'wont turn on', 'no power', 'dead', 'isolated', 'not turning on', 'not working', "won't start", 'wont start', 'not starting', 'car not starting', 'ev not starting', 'shut down', 'shuts down', 'switched off', 'stopped working', 'no response'],
            handler: () => {
                if (!hasData) return `I don't have live MOSFET/protection data yet. If the vehicle has completely no power, check that the ESP32 gateway itself has power and is connected before assuming it's a pack fault.`;
                if (s.chgMos === false && s.disMos === false) {
                    return `Both the Charge and Discharge MOSFETs are OFF — the pack is currently fully isolated by the BMS. That explains a "no power" symptom.\n\nWhat to do:\n1. Check the Realtime Metrics and Risk Evaluation tabs for the specific reading that triggered protection (voltage, temperature, or current).\n2. Let the pack sit and cool/rest, then check if it clears once the triggering condition normalizes.\n3. If it stays isolated with no obvious cause, that usually needs a manual BMS reset or inspection — call the helpline rather than trying to force it.`;
                }
                if (s.protectionActive) {
                    return `The BMS is currently reporting an active protection fault (status: ${s.status}). This is the BMS deliberately guarding the pack — treat it as a real signal, not a glitch.\n\nCheck the Risk Evaluation tab to see exactly which reading (voltage, temperature, or current) triggered it, address that condition, and if it doesn't clear on its own, call the helpline.`;
                }
                return `No active protection fault right now — Charge MOSFET: ${s.chgMos === null ? 'not reported' : (s.chgMos ? 'ON' : 'OFF')}, Discharge MOSFET: ${s.disMos === null ? 'not reported' : (s.disMos ? 'ON' : 'OFF')}. If you're still experiencing a power issue, it may be downstream of the pack (wiring, connector, or the ESP32 gateway itself) rather than the battery.`;
            }
        },
        {
            name: 'lifespan',
            keywords: ['lifespan', 'life span', 'replace', 'replacement', 'how long will it last', 'years left', 'rul', 'cycles left', 'how many years', 'battery life', 'how long does it last', 'need replacement', 'charge cycles', 'cycle count', 'how many cycles'],
            handler: () => {
                if (!hasData) return `I don't have live cycle data yet. In general, this pack is rated for about ${RATED_CYCLE_LIFE} charge cycles before it's expected to fall below 80% State of Health, the usual replacement threshold.`;
                return `Projected Remaining Useful Life: about ${s.rul} years, or roughly ${s.cyclesRemaining} charge cycles remaining out of the ${RATED_CYCLE_LIFE}-cycle rating, before the pack is expected to drop below the 80% SOH replacement threshold.\n\nThe biggest levers you have to extend this: keep the pack cooler (heat accelerates wear the most), avoid deep discharges, and go easy on fast charging when you don't need it.`;
            }
        },
        {
            name: 'cold',
            keywords: ['cold', 'winter', 'freezing', 'snow', 'chilly', 'low temperature outside'],
            handler: () => {
                const tempLine = hasData ? `Right now your pack is at ${s.temperature.toFixed(1)}°C.` : ``;
                return `${tempLine}\n\nCold affects EV packs in two ways: usable range temporarily drops (the chemistry is just less efficient when cold, even though real capacity is fine), and charging is intentionally slowed below ${TEMP_COLD_WARN}°C to protect the cells from lithium plating.\n\nTips: precondition/warm the pack before charging in cold weather if your setup supports it, avoid fast charging when very cold, and expect both range and charge speed to recover once temperatures rise.`;
            }
        },
        {
            name: 'regen',
            keywords: ['regen', 'regenerative', 'regen braking', 'brake energy', 'braking'],
            handler: () => {
                return `Regenerative braking recovers energy when you lift off the accelerator or brake, feeding some charge back into the pack instead of losing it all to heat in the brake pads.\n\nA few things worth knowing: it typically contributes a small percentage back to range rather than being a major charging source, it's usually reduced or disabled when the pack is very cold or already near 100% (there's nowhere for the energy to go), and heavy regen use doesn't meaningfully add extra wear compared to normal charge/discharge cycling. If regen suddenly feels weaker than usual, check the Realtime Metrics tab — it often points to a high SOC or cold pack temporarily limiting it.`;
            }
        },
        {
            name: 'chargingHabits',
            keywords: ['overnight', 'charge to 100', 'should i charge', 'how often should i charge', 'best practice', 'charging habit', 'daily charging', 'charge every day', 'charge everyday', 'how to charge'],
            handler: () => {
                return `Good daily-charging habits for long pack life:\n\n1. Keep routine charging between roughly 20–80% — this range is the gentlest on the cells.\n2. It's fine to charge overnight; just avoid leaving it sitting at 100% for long periods when you don't need the extra range immediately.\n3. Use fast charging when you need it, but favor standard/slow charging for everyday top-ups — it generates less heat and wear.\n4. Avoid routinely running it down near 0% before charging.\n\nCheck the Smart Charging tab for a live recommendation based on your pack's current state.`;
            }
        },
        {
            name: 'maintenance',
            keywords: ['maintenance', 'maintain', 'take care of', 'clean the battery', 'servicing', 'service', 'upkeep', 'how to maintain'],
            handler: () => {
                return `General battery care checklist:\n\n1. Favor 20–80% charging for daily use; reserve 0–100% for trips where you need the full range.\n2. Avoid parking in direct sun or extreme heat for long periods.\n3. Don't let it sit at very low charge for extended periods (weeks).\n4. Keep connectors and the charge port clean and dry.\n5. Check the Battery Health and Risk Evaluation tabs periodically, even when nothing feels wrong — catching a slow trend early is easier to act on than waiting for a visible problem.\n\nFor anything physical — connectors, wiring, unusual smells or sounds — that's a job for a technician rather than something to diagnose from telemetry, so use "Call Helpline" for that.`;
            }
        },
        {
            name: 'safety',
            keywords: ['safe', 'safety', 'dangerous', 'worried', 'is it ok', 'is this normal', 'is this a problem', 'should i worry', 'is it fine', 'am i safe'],
            handler: () => {
                if (!hasData) return `I don't have live data yet to give you a real safety read — connect the ESP32 gateway and I can check voltage, temperature, and current against safe limits directly.`;
                const level = s.riskLevel;
                if (level === 'bad') return `Right now at least one reading is outside its safe range — the dashboard's overall risk level is HIGH. I'd treat this as something to act on, not just monitor: check the Risk Evaluation tab to see exactly which check failed (voltage, temperature, or current) and follow the guidance there. If you're unsure, calling the helpline is the safe move.`;
                if (level === 'warn') return `Everything is currently operable, but at least one reading is trending close to a limit (overall risk: MODERATE). Not an emergency, but worth keeping an eye on — check the Risk Evaluation tab to see which check is flagged.`;
                return `Based on current readings, everything is within safe operating limits (overall risk: LOW). Voltage, temperature and current draw are all in their normal ranges right now.`;
            }
        },
        {
            name: 'power',
            keywords: ['power', 'watt', 'watts', 'wattage', 'how much power'],
            handler: () => {
                if (!hasData || s.power === null || s.power === undefined) return `I don't have a live power reading right now. Power is simply voltage × current — it tells you how much energy is flowing in or out of the pack at this instant.`;
                return `Current power flow: ${s.power.toFixed(2)}W (that's ${s.voltage.toFixed(2)}V × ${s.current !== null ? s.current.toFixed(2) : '--'}A). Higher power draw means faster discharge and more heat generated — sustained high power draw is one of the bigger contributors to both temperature rise and long-term wear.`;
            }
        },
        {
            name: 'current',
            keywords: ['current', 'amps', 'ampere', 'amperage', 'how many amps'],
            handler: () => {
                if (!hasData || s.current === null) return `Current draw isn't being reported right now. This pack's safe current limit is ${MAX_SAFE_CURRENT}A — sustained draw above that risks overheating and accelerated wear.`;
                const pct = (Math.abs(s.current) / MAX_SAFE_CURRENT * 100).toFixed(0);
                return `Current draw right now: ${s.current.toFixed(2)}A, which is about ${pct}% of the ${MAX_SAFE_CURRENT}A safe limit for this pack. ${Math.abs(s.current) > MAX_SAFE_CURRENT ? 'This exceeds the safe limit — ease off load immediately.' : Math.abs(s.current) > MAX_SAFE_CURRENT * 0.8 ? "That's approaching the limit — fine briefly, but avoid sustaining it." : "That's a comfortable, safe level."}`;
            }
        },
        {
            name: 'status',
            keywords: [
                'how is my battery', "how's my battery", 'hows my battery', 'how is my ev', "how's my ev", 'hows my ev',
                'how is my car', "how's my car", 'how is my pack', "how's my pack", 'how is it doing', "how's it doing",
                'battery status', 'status check', 'check my battery', 'check battery', 'how does my battery look',
                'battery report', 'give me an update', 'update me', 'overall status', 'general status', 'how is everything',
                'is everything ok', 'is everything okay', 'is everything fine', 'battery report card', 'battery overview',
                'current status', 'whats the status', "what's the status", 'battery summary', 'quick summary'
            ],
            handler: () => buildStatusSummary(s)
        },
        {
            name: 'glossary',
            keywords: ['what is soc', 'what is soh', 'what does soh mean', 'what is rul', 'what does rul mean', 'what is mosfet', 'explain soc', 'explain soh', 'what does soc mean', 'what does this mean'],
            handler: () => {
                return `Quick glossary:\n\n• SOC (State of Charge) — how full the pack is right now, like a fuel gauge, 0–100%.\n• SOH (State of Health) — how much of the pack's original capacity is still usable, based on voltage, charge level and accumulated wear.\n• RUL (Remaining Useful Life) — a projection of how many more years the pack should last before it drops below the 80% SOH replacement point.\n• MOSFET — an electronic switch the BMS uses to enable or cut off charging/discharging as a safety measure.\n\nEach of these has its own tab on the dashboard with the live number and a plain-language breakdown.`;
            }
        }
    ];

    // Score each topic by matched keywords, weighting multi-word phrases
    // higher so specific phrases (e.g. "fast charge") beat generic
    // single-word overlaps (e.g. "charge").
    let best = null, bestScore = 0;
    for (const topic of topics) {
        const score = topic.keywords.reduce((acc, kw) => t.includes(kw) ? acc + kw.split(' ').length : acc, 0);
        if (score > bestScore) { bestScore = score; best = topic; }
    }

    if (best) return best.handler();

    const smallTalk = handleSmallTalk(t);
    if (smallTalk) return smallTalk;

    // Generic "something's wrong" phrasing that didn't match a specific
    // topic — rather than a dead-end, ground the reply in whatever live
    // data is available and ask a sharper follow-up question.
    if (/(problem|issue|wrong|help me|something.?s? wrong|not working|malfunction|acting up|weird|strange)/.test(t)) {
        if (hasData) {
            const bits = [`Here's where things stand right now: ${s.voltage.toFixed(2)}V, ${s.temperature.toFixed(1)}°C, ${s.soc}% charge, overall risk level "${s.riskLevel}".`];
            if (s.riskLevel !== 'ok') {
                bits.push(`That risk level isn't fully green, so check the Risk Evaluation tab for exactly which reading is flagged — that's usually the fastest way to pin down what's happening.`);
            } else {
                bits.push(`Nothing here is out of range at the moment, so if something still feels off, tell me more specifically what you're noticing — is it about heat, charging speed, range, a noise, or something else?`);
            }
            return bits.join(' ');
        }
        return `I'd like to help narrow this down — can you tell me more specifically what you're noticing? For example: is the pack running hot, charging slowly or not at all, draining faster than usual, or something else? Also worth connecting the ESP32 gateway so I can check live readings.`;
    }

    // Last resort: if they mentioned the battery/car/EV at all but
    // nothing matched precisely, don't leave them with a non-answer —
    // give the live snapshot, since that's almost always relevant.
    if (hasData && /\b(battery|pack|ev|vehicle|car)\b/.test(t)) {
        return buildStatusSummary(s) + `\n\nI wasn't 100% sure what you were asking, so here's a general snapshot — feel free to ask something more specific and I'll dig deeper.`;
    }

    return `I'm not totally sure I caught that one, but I want to actually help rather than just point you at a menu — try putting it in your own words: what's the battery or EV doing that seems off?\n\nI'm built specifically for your EV's battery, so I'm most useful on: heat/thermal issues, charging speed or faults, fast drain or reduced range, voltage swings, cell balancing, overall health and remaining lifespan, fast-charge safety, power/current draw, charging habits, and regen braking. General non-battery questions are outside what I can do.\n\nFor anything urgent, or outside what I can diagnose from telemetry (noises, physical damage, wiring), use "Call Helpline" to reach a technician directly.`;
}

// -----------------------------------------------------------------
// Small talk / general conversation layer — greetings, farewells,
// thanks, how-are-you, identity questions, capability questions,
// short acknowledgements, yes/no, laughter, apologies and compliments.
// Checked after the battery-topic scoring so a message like "hey, my
// pack is overheating" still gets the overheating diagnosis, not just
// a greeting. Several replies are randomized slightly so it doesn't
// feel like the same canned line every time.
// -----------------------------------------------------------------
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function handleSmallTalk(t) {
    const clean = t.trim().replace(/[.!?]+$/, '');

    // Greetings
    if (/^\s*(hi+|hello+|hey+|yo|sup|wassup|what'?s up|good morning|good evening|good afternoon|namaste|howdy)\b/.test(t)) {
        return pickRandom([
            `Hey there! I'm the VoltGuard AI Battery Assistant — happy to help with anything battery or EV related. What's going on?`,
            `Hello! What can I help you with today — charging, range, health, anything battery-related?`,
            `Hi! Good to see you. What's up with your battery today?`
        ]);
    }

    // Farewells
    if (/^\s*(bye+|goodbye|see\s?ya|see\s?you|later|gtg|ttyl|take care|good night|good\s?bye)\b/.test(clean)) {
        return pickRandom([
            `Take care! Come back anytime you have a battery question — and don't hesitate to call the helpline if anything feels urgent.`,
            `Bye for now! I'll be here whenever you need me.`
        ]);
    }

    // Gratitude
    if (/\b(thanks|thank you|thx|ty|appreciate it|much appreciated)\b/.test(t)) {
        return pickRandom([
            `You're welcome! Anytime — happy to help with anything else battery or EV related.`,
            `Glad I could help! Let me know if anything else comes up.`
        ]);
    }

    // How are you
    if (/how('?s| is| are) (you|it going|things going|everything)\b|\byou (good|okay|ok)\??$/.test(clean)) {
        return `I'm doing well, thanks for asking! Running smoothly and ready to help — how's your EV treating you today?`;
    }

    // Identity
    if (/who are you|what are you|your name|are you (a bot|human|ai|real)/.test(t)) {
        return `I'm the AI Battery Assistant built into VoltGuard AI — a diagnostic helper that reads your pack's live telemetry (voltage, temperature, charge level, health) to figure out what's going on and what to do about it. Think of me as your first stop before calling the helpline.`;
    }

    // Capabilities
    if (/what can you do|what do you do|how can you help|what.*you help with|^\s*help\s*$/.test(t)) {
        return `I can help you understand what's happening with your EV battery — things like overheating, charging issues, fast drain, voltage problems, cell balancing, overall health and remaining lifespan, whether fast charging is safe right now, and general care tips. Just describe what you're noticing, in your own words, and I'll dig in using your pack's live data.`;
    }

    // Short acknowledgements
    if (/^\s*(ok|okay|k|alright|cool|nice|great|got it|sure|fine|good|understood)$/.test(clean)) {
        return pickRandom([
            `👍 Let me know if anything else comes up — I'm here.`,
            `Sounds good! Ask away if anything else crosses your mind.`
        ]);
    }

    // Bare yes / no
    if (/^\s*(yes|yeah|yep|yup)$/.test(clean)) {
        return `Got it — go ahead and tell me more, or ask your next question.`;
    }
    if (/^\s*(no|nope|nah)$/.test(clean)) {
        return `No worries. Let me know if something else comes up.`;
    }

    // Laughter
    if (/^\s*(lol|haha+|lmao|😂|🤣)/.test(t)) {
        return `😄 Anything battery-related I can help with?`;
    }

    // Apologies
    if (/^\s*(sorry|my bad|oops)\b/.test(t)) {
        return `No need to apologize — what's on your mind?`;
    }

    // Compliments
    if (/you'?re (great|awesome|helpful|amazing|smart)|good (job|bot)|nice work/.test(t)) {
        return `That's kind of you to say — thank you! Let me know what else I can help with.`;
    }

    return null;
}
