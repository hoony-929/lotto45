const STORAGE_KEY = 'lottoStatePremiumV2';
const STATS_CACHE_PREFIX = 'lottoStatsCache';
const DRAW_API_BASE = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';
const INITIAL_ROWS = Array.from({ length: 5 }, () => ({ numbers: [], type: '' }));
const typeLabelMap = { manual: '수동', semi: '반자동', auto: '자동' };

let state = {
    activeRowIndex: 0,
    selectMode: 'include',
    excludedNumbers: [],
    rowsData: INITIAL_ROWS.map((row) => ({ ...row }))
};

let isAnimating = false;

function validNumber(value) {
    return Number.isInteger(value) && value >= 1 && value <= 45;
}

function cloneRows(rows) {
    return rows.map((row) => ({
        numbers: Array.isArray(row.numbers) ? row.numbers.filter(validNumber).sort((a, b) => a - b) : [],
        type: typeof row.type === 'string' ? row.type : ''
    }));
}

function createNetworkError(message, cause) {
    const error = new Error(message);
    error.code = 'NETWORK';
    error.cause = cause;
    return error;
}

function isNetworkError(error) {
    return error && error.code === 'NETWORK';
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed.rowsData) || parsed.rowsData.length !== 5) return;

        state = {
            activeRowIndex: Number.isInteger(parsed.activeRowIndex) ? Math.max(0, Math.min(4, parsed.activeRowIndex)) : 0,
            selectMode: parsed.selectMode === 'exclude' ? 'exclude' : 'include',
            excludedNumbers: Array.isArray(parsed.excludedNumbers) ? parsed.excludedNumbers.filter(validNumber).sort((a, b) => a - b) : [],
            rowsData: cloneRows(parsed.rowsData)
        };
    } catch (error) {
        console.error('상태 복원 실패', error);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setStatus(message) {
    document.getElementById('statusMessage').textContent = message;
}

function renderNumberPool() {
    const pool = document.getElementById('numberPool');
    pool.innerHTML = '';

    for (let number = 1; number <= 45; number += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'num-btn';
        button.dataset.num = String(number);
        button.textContent = String(number);
        button.addEventListener('click', () => handleNumberClick(number));
        pool.appendChild(button);
    }
}

function renderRows() {
    const container = document.getElementById('rowsContainer');
    container.innerHTML = '';

    state.rowsData.forEach((row, index) => {
        const article = document.createElement('article');
        article.className = `row ${index === state.activeRowIndex ? 'active' : ''}`;

        const head = document.createElement('div');
        head.className = 'row-head';
        head.innerHTML = `<div class="row-label">${index + 1}줄</div>`;
        if (row.type) {
            head.innerHTML += `<span class="row-type ${row.type}">${typeLabelMap[row.type]}</span>`;
        }

        const slots = document.createElement('div');
        slots.className = 'slots';
        slots.id = `slots-${index}`;
        for (let i = 0; i < 6; i += 1) {
            const slot = document.createElement('div');
            slot.className = row.numbers[i] ? 'slot filled' : 'slot';
            slot.textContent = row.numbers[i] ?? '';
            slots.appendChild(slot);
        }

        const actions = document.createElement('div');
        actions.className = 'row-actions';

        const picker = document.createElement('label');
        picker.className = 'pick-label';
        picker.innerHTML = `<input type="radio" name="manualSelect" value="${index}" ${index === state.activeRowIndex ? 'checked' : ''}> 선택`;
        picker.querySelector('input').addEventListener('change', () => {
            if (isAnimating) return;
            state.activeRowIndex = index;
            updateAllUI();
        });

        const autoButton = document.createElement('button');
        autoButton.type = 'button';
        autoButton.className = 'btn btn-gold';
        autoButton.textContent = '자동';
        autoButton.disabled = isAnimating;
        autoButton.addEventListener('click', () => handleAutoClick(index));

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'btn';
        clearButton.textContent = '초기화';
        clearButton.disabled = isAnimating;
        clearButton.addEventListener('click', () => {
            state.rowsData[index] = { numbers: [], type: '' };
            updateAllUI();
            setStatus(`${index + 1}줄을 비웠습니다.`);
        });

        actions.append(picker, autoButton, clearButton);
        article.append(head, slots, actions);
        container.appendChild(article);
    });

    document.getElementById('autoAllButton').disabled = isAnimating;
    document.getElementById('clearAllButton').disabled = isAnimating;
}

function updateNumberPoolUI() {
    const activeNumbers = state.rowsData[state.activeRowIndex].numbers;
    document.querySelectorAll('.num-btn').forEach((button) => {
        const number = Number(button.dataset.num);
        button.className = 'num-btn';
        button.disabled = isAnimating;

        if (state.excludedNumbers.includes(number)) button.classList.add('excluded');
        else if (activeNumbers.includes(number)) button.classList.add('selected');
    });
}

function updateAllUI() {
    renderRows();
    updateNumberPoolUI();
    document.querySelector(`input[name="selectMode"][value="${state.selectMode}"]`).checked = true;
    saveState();
}

function toggleExcludedNumber(number) {
    if (state.excludedNumbers.includes(number)) {
        state.excludedNumbers = state.excludedNumbers.filter((item) => item !== number);
        setStatus(`${number}번 제외를 해제했습니다.`);
        return;
    }

    if (state.rowsData.some((row) => row.numbers.includes(number))) {
        alert('이미 줄에 담긴 번호는 제외 번호로 바꿀 수 없습니다.');
        return;
    }

    if (state.excludedNumbers.length >= 39) {
        alert('제외 번호가 너무 많습니다. 최소 6개는 남겨주세요.');
        return;
    }

    state.excludedNumbers = [...state.excludedNumbers, number].sort((a, b) => a - b);
    setStatus(`${number}번을 제외 번호에 추가했습니다.`);
}

function toggleIncludedNumber(number) {
    if (state.excludedNumbers.includes(number)) {
        alert('제외 번호로 지정된 숫자입니다. 제외 해제 후 선택해주세요.');
        return;
    }

    const row = state.rowsData[state.activeRowIndex];
    if (row.numbers.includes(number)) {
        row.numbers = row.numbers.filter((item) => item !== number);
    } else {
        if (row.numbers.length >= 6) {
            alert('한 줄에는 6개까지만 담을 수 있습니다.');
            return;
        }
        row.numbers = [...row.numbers, number].sort((a, b) => a - b);
    }

    row.type = row.numbers.length ? 'manual' : '';
    setStatus(`${state.activeRowIndex + 1}줄의 수동 번호를 조정했습니다.`);
}

function handleNumberClick(number) {
    if (isAnimating) return;

    if (state.selectMode === 'exclude') toggleExcludedNumber(number);
    else toggleIncludedNumber(number);

    updateAllUI();
}

function getAvailablePool(existingNumbers = []) {
    return Array.from({ length: 45 }, (_, index) => index + 1).filter((number) => {
        return !state.excludedNumbers.includes(number) && !existingNumbers.includes(number);
    });
}

function pickRandomNumbers(pool, count) {
    const source = [...pool];
    const selected = [];

    while (selected.length < count) {
        const pickIndex = Math.floor(Math.random() * source.length);
        selected.push(source.splice(pickIndex, 1)[0]);
    }

    return selected.sort((a, b) => a - b);
}

function buildTargetRow(index, replaceAll = false) {
    const row = state.rowsData[index];
    const baseNumbers = replaceAll ? [] : [...row.numbers];
    const needed = 6 - baseNumbers.length;
    const pool = getAvailablePool(baseNumbers);

    if (pool.length < needed) {
        throw new Error('제외 번호가 너무 많아서 번호를 채울 수 없습니다.');
    }

    return [...baseNumbers, ...pickRandomNumbers(pool, needed)].sort((a, b) => a - b);
}

async function applyRowResult(index, finalNumbers, rowType) {
    isAnimating = true;
    updateAllUI();
    state.rowsData[index] = { numbers: finalNumbers, type: rowType };
    isAnimating = false;
    updateAllUI();
}

async function handleAutoClick(index) {
    try {
        const row = state.rowsData[index];
        if (row.numbers.length === 6) {
            alert('이미 6개 번호가 모두 채워져 있습니다.');
            return;
        }

        const targetNumbers = buildTargetRow(index, false);
        const nextType = row.numbers.length > 0 ? 'semi' : 'auto';
        await applyRowResult(index, targetNumbers, nextType);
        setStatus(`${index + 1}줄 자동 생성이 완료되었습니다.`);
    } catch (error) {
        alert(error.message);
    }
}

async function handleAutoAllClick() {
    try {
        for (let index = 0; index < state.rowsData.length; index += 1) {
            const row = state.rowsData[index];
            const replaceAll = row.numbers.length === 6 && row.type !== 'manual';
            const targetNumbers = buildTargetRow(index, replaceAll);
            const nextType = row.numbers.length > 0 && !replaceAll ? 'semi' : 'auto';
            await applyRowResult(index, targetNumbers, nextType);
        }
        setStatus('전체 랜덤 5줄 생성이 완료되었습니다.');
    } catch (error) {
        alert(error.message);
    }
}

function clearAllRows() {
    state = {
        ...state,
        excludedNumbers: [],
        rowsData: INITIAL_ROWS.map((row) => ({ ...row }))
    };
    updateAllUI();
    setStatus('모든 줄과 제외 번호를 초기화했습니다.');
}

async function fetchDraw(round) {
    let response;

    try {
        response = await fetch(`${DRAW_API_BASE}${round}`);
    } catch (error) {
        throw createNetworkError('동행복권 API 연결에 실패했습니다.', error);
    }

    if (!response.ok) {
        throw new Error(`회차 ${round} 데이터를 불러오지 못했습니다.`);
    }

    const data = await response.json();
    if (data.returnValue !== 'success') {
        throw new Error(`회차 ${round} 데이터가 존재하지 않습니다.`);
    }
    return data;
}

function estimateLatestRound() {
    const firstDrawDate = new Date('2002-12-07T21:00:00+09:00');
    const diffDays = Math.floor((Date.now() - firstDrawDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 2;
}

async function resolveLatestRound() {
    let guess = estimateLatestRound();
    while (guess > 0) {
        try {
            const draw = await fetchDraw(guess);
            return { round: guess, draw };
        } catch (error) {
            if (isNetworkError(error)) {
                throw error;
            }
            guess -= 1;
        }
    }
    throw new Error('최신 회차를 찾지 못했습니다.');
}

function renderHistory(draws) {
    const list = document.getElementById('historyList');
    const meta = document.getElementById('historyMeta');
    list.innerHTML = '';
    meta.textContent = `최신 ${draws.length}회차`;

    draws.forEach((draw) => {
        const numbers = [draw.drwtNo1, draw.drwtNo2, draw.drwtNo3, draw.drwtNo4, draw.drwtNo5, draw.drwtNo6];
        const article = document.createElement('article');
        article.className = 'history-item';
        article.innerHTML = `
            <div class="history-meta">
                <strong>${draw.drwNo}회</strong>
                <span>${draw.drwNoDate}</span>
            </div>
            <div class="history-balls">
                ${numbers.map((number) => `<span class="mini-ball">${number}</span>`).join('')}
                <span class="plus">+</span>
                <span class="mini-ball bonus">${draw.bnusNo}</span>
            </div>
        `;
        list.appendChild(article);
    });
}

function loadStatsCache(round) {
    try {
        const cached = localStorage.getItem(`${STATS_CACHE_PREFIX}:${round}`);
        if (!cached) return null;

        const parsed = JSON.parse(cached);
        return Array.isArray(parsed.rankings) ? parsed.rankings : null;
    } catch (error) {
        return null;
    }
}

function saveStatsCache(round, rankings) {
    localStorage.setItem(`${STATS_CACHE_PREFIX}:${round}`, JSON.stringify({ rankings }));
}

function renderRankings(rankings, totalRounds) {
    const list = document.getElementById('rankList');
    const meta = document.getElementById('rankMeta');
    list.innerHTML = '';
    meta.textContent = `${totalRounds}회차 누적 기준`;

    rankings.forEach((item, index) => {
        const article = document.createElement('article');
        article.className = 'rank-item';
        article.innerHTML = `
            <div class="rank-left">
                <span class="rank-badge">${index + 1}</span>
                <span class="rank-ball">${item.number}</span>
            </div>
            <span class="rank-count">${item.count}회 출현</span>
        `;
        list.appendChild(article);
    });
}

async function calculateTopNumbers(maxRound) {
    const counts = Array.from({ length: 46 }, () => 0);
    const rounds = Array.from({ length: maxRound }, (_, index) => index + 1);
    const chunkSize = 20;

    for (let i = 0; i < rounds.length; i += chunkSize) {
        const chunk = rounds.slice(i, i + chunkSize);
        const draws = await Promise.all(chunk.map((round) => fetchDraw(round)));

        draws.forEach((draw) => {
            [draw.drwtNo1, draw.drwtNo2, draw.drwtNo3, draw.drwtNo4, draw.drwtNo5, draw.drwtNo6].forEach((number) => {
                counts[number] += 1;
            });
        });
    }

    return counts
        .map((count, number) => ({ number, count }))
        .filter((item) => item.number > 0)
        .sort((a, b) => (b.count - a.count) || (a.number - b.number))
        .slice(0, 10);
}

async function fetchRecentHistoryAndStats() {
    try {
        const latest = await resolveLatestRound();
        const latestRound = latest.round;
        const recentPromises = [];

        for (let round = latestRound; round > latestRound - 10 && round > 0; round -= 1) {
            recentPromises.push(fetchDraw(round));
        }

        const recentDraws = await Promise.all(recentPromises);
        renderHistory(recentDraws);
        setStatus(`${latestRound}회차 기준 최근 당첨 내역을 반영했습니다.`);

        const cachedRankings = loadStatsCache(latestRound);
        if (cachedRankings) {
            renderRankings(cachedRankings, latestRound);
            return;
        }

        const rankings = await calculateTopNumbers(latestRound);
        saveStatsCache(latestRound, rankings);
        renderRankings(rankings, latestRound);
    } catch (error) {
        console.error(error);
        document.getElementById('historyList').innerHTML = '<div class="placeholder">당첨 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>';
        document.getElementById('rankList').innerHTML = '<div class="placeholder">통계를 계산하지 못했습니다. 네트워크 상태를 확인해주세요.</div>';
        document.getElementById('historyMeta').textContent = '불러오기 실패';
        document.getElementById('rankMeta').textContent = '계산 실패';
        setStatus(isNetworkError(error) ? '동행복권 API 인증서 또는 네트워크 문제로 연결하지 못했습니다.' : '외부 API 연결에 실패했습니다. 다시 시도해주세요.');
    }
}

function bindEvents() {
    document.querySelectorAll('input[name="selectMode"]').forEach((input) => {
        input.addEventListener('change', (event) => {
            state.selectMode = event.target.value;
            saveState();
            setStatus(state.selectMode === 'include' ? '번호 고정 모드입니다.' : '번호 제외 모드입니다.');
        });
    });

    document.getElementById('autoAllButton').addEventListener('click', handleAutoAllClick);
    document.getElementById('clearAllButton').addEventListener('click', clearAllRows);
}

function init() {
    loadState();
    renderNumberPool();
    renderRows();
    updateNumberPoolUI();
    bindEvents();
    fetchRecentHistoryAndStats();
}

init();
