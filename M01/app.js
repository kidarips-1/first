(function (global) {
  'use strict';

  function normalizeNames(text) {
    var seen = Object.create(null);

    return String(text || '')
      .split(/\r?\n/)
      .map(function (name) { return name.trim(); })
      .filter(function (name) {
        if (!name || seen[name]) {
          return false;
        }
        seen[name] = true;
        return true;
      });
  }

  function validateDrawCount(count, availableCount) {
    var parsedCount = Number(count);

    if (!Number.isInteger(parsedCount) || parsedCount < 1) {
      return { valid: false, message: '당첨 인원은 1명 이상으로 설정해 주세요.' };
    }

    if (parsedCount > availableCount) {
      return { valid: false, message: '당첨 인원은 참가자 수보다 많을 수 없습니다.' };
    }

    return { valid: true, message: '' };
  }

  function secureRandomIndex(length) {
    if (length <= 0) {
      throw new RangeError('후보가 한 명 이상 필요합니다.');
    }

    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      var values = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / length) * length;
      do {
        global.crypto.getRandomValues(values);
      } while (values[0] >= limit);
      return values[0] % length;
    }

    return Math.floor(Math.random() * length);
  }

  function pickUnique(items, count, randomIndex) {
    var remaining = items.slice();
    var winners = [];
    var chooseIndex = randomIndex || secureRandomIndex;

    for (var i = 0; i < count; i += 1) {
      var index = chooseIndex(remaining.length);
      winners.push(remaining.splice(index, 1)[0]);
    }

    return { winners: winners, remaining: remaining };
  }

  function createInitialState() {
    return { winners: [], remaining: [], isDrawing: false };
  }

  function safeCelebrate(confettiFunction) {
    if (typeof confettiFunction !== 'function') {
      return false;
    }

    try {
      var common = {
        colors: ['#8b5cf6', '#3b82f6', '#39d9ff', '#f472d0', '#f9d56e'],
        disableForReducedMotion: true,
        zIndex: 1000
      };
      confettiFunction(Object.assign({}, common, {
        particleCount: 90,
        spread: 95,
        startVelocity: 48,
        origin: { x: 0.5, y: 0.58 }
      }));
      confettiFunction(Object.assign({}, common, {
        particleCount: 45,
        angle: 60,
        spread: 65,
        origin: { x: 0, y: 0.62 }
      }));
      confettiFunction(Object.assign({}, common, {
        particleCount: 45,
        angle: 120,
        spread: 65,
        origin: { x: 1, y: 0.62 }
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function createController(elements, options) {
    var settings = options || {};
    var state = createInitialState();

    function setLocked(locked) {
      elements.namesInput.disabled = locked;
      elements.drawCountInput.disabled = locked;
      elements.startButton.disabled = locked;
      elements.resetButton.disabled = locked;
    }

    function updateParticipantCount() {
      var count = normalizeNames(elements.namesInput.value).length;
      elements.participantCount.textContent = String(count);
      elements.drawCountInput.max = String(Math.max(count, 1));
      return count;
    }

    function defaultAnimateWinner(winner, candidates) {
      var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        elements.rouletteName.textContent = winner;
        return Promise.resolve();
      }

      return new Promise(function (resolve) {
        var cursor = 0;
        var interval = global.setInterval(function () {
          elements.rouletteName.textContent = candidates[cursor % candidates.length];
          cursor += 1;
        }, 70);

        global.setTimeout(function () {
          global.clearInterval(interval);
          elements.rouletteName.textContent = winner;
          resolve();
        }, 1500);
      });
    }

    function appendWinner(winner) {
      var item = document.createElement('li');
      item.textContent = winner;
      elements.resultsList.appendChild(item);
    }

    async function start() {
      if (state.isDrawing) {
        return false;
      }

      var participants = normalizeNames(elements.namesInput.value);
      if (!participants.length) {
        elements.statusMessage.textContent = '참가자 이름을 한 명 이상 입력해 주세요.';
        return false;
      }

      var availableParticipants = participants.filter(function (participant) {
        return state.winners.indexOf(participant) === -1;
      });
      if (!availableParticipants.length) {
        elements.statusMessage.textContent = '모든 참가자의 추첨이 완료되었습니다. 결과를 초기화해 주세요.';
        return false;
      }

      var validation = validateDrawCount(elements.drawCountInput.value, availableParticipants.length);
      if (!validation.valid) {
        elements.statusMessage.textContent = state.winners.length && Number(elements.drawCountInput.value) > availableParticipants.length
          ? '남은 참가자는 ' + availableParticipants.length + '명입니다. 당첨 인원을 줄이거나 결과를 초기화해 주세요.'
          : validation.message;
        return false;
      }

      state.isDrawing = true;
      state.remaining = availableParticipants.slice();
      elements.statusMessage.textContent = '행운의 주인공을 찾고 있어요!';
      elements.rouletteName.classList.add('is-spinning');
      setLocked(true);

      try {
        var selection = pickUnique(availableParticipants, Number(elements.drawCountInput.value), settings.randomIndex);
        state.remaining = selection.remaining.slice();

        for (var i = 0; i < selection.winners.length; i += 1) {
          var winner = selection.winners[i];
          var animate = settings.animateWinner || defaultAnimateWinner;
          await animate(winner, availableParticipants);
          state.winners.push(winner);
          appendWinner(winner);
          if (typeof settings.celebrate === 'function') {
            settings.celebrate();
          }
        }

        elements.statusMessage.textContent = state.winners.length + '명의 당첨자가 결정되었습니다!';
        return true;
      } finally {
        state.isDrawing = false;
        elements.rouletteName.classList.remove('is-spinning');
        setLocked(false);
      }
    }

    function reset() {
      if (state.isDrawing) {
        return false;
      }
      state = createInitialState();
      elements.resultsList.innerHTML = '';
      elements.rouletteName.textContent = '준비 완료';
      elements.statusMessage.textContent = '참가자와 당첨 인원을 확인한 뒤 추첨을 시작하세요.';
      updateParticipantCount();
      return true;
    }

    function getState() {
      return {
        winners: state.winners.slice(),
        remaining: state.remaining.slice(),
        isDrawing: state.isDrawing
      };
    }

    updateParticipantCount();

    return {
      start: start,
      reset: reset,
      getState: getState,
      updateParticipantCount: updateParticipantCount
    };
  }

  global.LuckyDraw = {
    normalizeNames: normalizeNames,
    validateDrawCount: validateDrawCount,
    pickUnique: pickUnique,
    createInitialState: createInitialState,
    secureRandomIndex: secureRandomIndex,
    createController: createController,
    safeCelebrate: safeCelebrate
  };

  function connectPage() {
    var namesInput = document.getElementById('participant-names');
    if (!namesInput) {
      return;
    }

    var elements = {
      namesInput: namesInput,
      drawCountInput: document.getElementById('winner-count'),
      startButton: document.getElementById('draw-button'),
      resetButton: document.getElementById('reset-button'),
      rouletteName: document.getElementById('roulette-name'),
      statusMessage: document.getElementById('status-message'),
      resultsList: document.getElementById('winner-list'),
      participantCount: document.getElementById('participant-count')
    };
    var controller = createController(elements, {
      celebrate: function () { safeCelebrate(global.confetti); }
    });

    elements.namesInput.addEventListener('input', controller.updateParticipantCount);
    elements.startButton.addEventListener('click', controller.start);
    elements.resetButton.addEventListener('click', controller.reset);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connectPage);
  } else {
    connectPage();
  }
}(window));
