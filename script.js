document.addEventListener('DOMContentLoaded', () => {
    const ui = {
        // ... (既存のUI要素) ...
        questionNumberText: document.getElementById('questionNumberText'),
        questionText: document.getElementById('questionText'),
        answerInput: document.getElementById('answerInput'),
        submitAnswer: document.getElementById('submitAnswer'),
        resultText: document.getElementById('resultText'),
        correctAnswerText: document.getElementById('correctAnswerText'),
        nextQuestion: document.getElementById('nextQuestion'),
        loadingMessage: document.getElementById('loadingMessage'),
        errorMessage: document.getElementById('errorMessage'),
        quizEndMessage: document.getElementById('quizEndMessage'),
        quizArea: document.getElementById('quizArea'),
        resultArea: document.getElementById('resultArea'),
        correctRateText: document.getElementById('correctRateText'),
        avgRevealRateText: document.getElementById('avgRevealRateText'),
        disputeButton: document.getElementById('disputeButton'),
        stopSlowDisplayTextButton: document.getElementById('stopSlowDisplayTextButton'),
        enableHintCheckbox: document.getElementById('enableHintCheckbox'),
        hintAreaContainer: document.querySelector('.hint-area-container'),
        hintButton: document.getElementById('hintButton'),
        hintTextDisplay: document.getElementById('hintTextDisplay'),
        showStoneImageCheckbox: document.getElementById('showStoneImageCheckbox'),
        stoneImage: document.getElementById('stoneImage'),
        currentScoreText: document.getElementById('currentScoreText'),
        finalScoreArea: document.getElementById('finalScoreArea'),
        finalNormalizedScoreText: document.getElementById('finalNormalizedScoreText'),
        finalRawScoreText: document.getElementById('finalRawScoreText'),
        finalScoreMessage: document.getElementById('finalScoreMessage'),
        playAgainButton: document.getElementById('playAgainButton'),
        seedInput: document.getElementById('seedInput'),
        applySeedButton: document.getElementById('applySeedButton'),
        // ▼▼▼ シード入力エリア全体を制御するため追加 ▼▼▼
        seedInputArea: document.querySelector('.seed-input-area')
        // ▲▲▲ シード入力エリア全体を制御するため追加 ▲▲▲
    };

    // ... (定数、グローバル変数、shuffleArrayWithSeed などは変更なし) ...
    const CSV_FILE_PATH = 'みんはや問題リストv1.27 - 問題リスト.csv';
    const COLUMN_INDICES = { QUESTION: 0, DISPLAY_ANSWER: 1, READING_ANSWER: 2 };
    const QUESTIONS_PER_SESSION = 10;
    const SLOW_DISPLAY_INTERVAL_MS = 180; 
    const MAX_POINTS_PER_QUESTION_BASE = 1000;
    const REVEAL_PENALTY_PER_PERCENT = 7; 
    const HINT_PENALTY_FACTOR = 0.5;
    const IMAGE_HIDDEN_PENALTY_FACTOR = 0.2;

    let allLoadedQuizzes = [];
    let currentQuizSession = [];
    let overallQuizIndex = 0;
    let currentQuestionInSessionIndex = 0;
    let sessionRawScore = 0;
    let hintUsedThisQuestion = false;
    let slowDisplayTextIntervalId = null;
    let currentQuestionFullText = '';
    let currentDisplayedCharIndex = 0;
    let stoppedAtIndex = -1;
    let correctAnswersOverall = 0;
    let questionsAttemptedOverall = 0;
    let totalRevealPercentageSumForStat = 0;
    let slowDisplayAnswerCountForStat = 0;
    let currentSeed = '';
    let isQuizDataLoaded = false; // quizDataがロードされたかのフラグ
    let lastAnswerWasInitiallyIncorrect = false;


    function shuffleArrayWithSeed(array, seed) {
        if (typeof Math.seedrandom === 'function') { Math.seedrandom(seed); }
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        if (typeof Math.seedrandom === 'function') { Math.seedrandom(); }
    }

    function initializeGlobalStats() {
        correctAnswersOverall = 0; questionsAttemptedOverall = 0;
        totalRevealPercentageSumForStat = 0; slowDisplayAnswerCountForStat = 0;
        ui.correctRateText.textContent = '正答率: ---';
        ui.avgRevealRateText.textContent = '平均開示率: ---';
    }
    
    function startNewSession() {
        currentQuizSession = allLoadedQuizzes.slice(overallQuizIndex, overallQuizIndex + QUESTIONS_PER_SESSION);
        overallQuizIndex += currentQuizSession.length;

        if (currentQuizSession.length === 0 && overallQuizIndex > 0 ) {
             ui.quizArea.style.display = 'none';
             ui.finalScoreArea.style.display = 'none';
             ui.quizEndMessage.textContent = `シード「${currentSeed}」での問題は全て終了しました。`;
             ui.quizEndMessage.style.display = 'block';
             ui.hintAreaContainer.style.display = 'none';
             // ▼▼▼ シード入力エリアを再度表示 ▼▼▼
             ui.seedInputArea.style.display = 'flex'; 
             ui.seedInput.disabled = false;
             ui.applySeedButton.disabled = false;
             // ▲▲▲ シード入力エリアを再度表示 ▲▲▲
             return;
        }
         if (currentQuizSession.length === 0 && overallQuizIndex === 0) {
            ui.errorMessage.textContent = '有効なクイズデータがCSVから読み込めませんでした。';
            ui.errorMessage.style.display = 'block';
            return;
        }
        
        currentQuestionInSessionIndex = 0;
        sessionRawScore = 0;
        ui.currentScoreText.textContent = `現在スコア: 0`;
        ui.finalScoreArea.style.display = 'none';
        ui.quizArea.style.display = 'block';
        ui.quizEndMessage.style.display = 'none';
        ui.loadingMessage.style.display = 'none';

        displayQuestion();
    }

    function initializeQuizSettings() {
        if (ui.enableHintCheckbox.checked) { ui.hintAreaContainer.style.display = 'block'; }
        else { ui.hintAreaContainer.style.display = 'none'; }

        if (ui.showStoneImageCheckbox.checked) { ui.stoneImage.style.display = ''; }
        else { ui.stoneImage.style.display = 'none'; }
    }

    async function preloadQuizData() {
        try {
            ui.loadingMessage.textContent = "問題データを準備中...";
            ui.loadingMessage.style.display = 'block';
            ui.seedInputArea.style.display = 'none'; // ロード中はシードエリアも隠す

            const response = await fetch(CSV_FILE_PATH);
            if (!response.ok) throw new Error(`CSVエラー (${response.status})`);
            let csvText = await response.text();
            if (csvText.startsWith('\uFEFF')) csvText = csvText.substring(1);
            const lines = csvText.trim().split(/\r?\n/);
            if (lines.length <= 1) throw new Error('CSVデータなし');

            quizzesFromFile = lines.slice(1).map(line => {
                const parts = line.split(',');
                const question = parts[COLUMN_INDICES.QUESTION]?.trim();
                const displayAnswer = parts[COLUMN_INDICES.DISPLAY_ANSWER]?.trim();
                const readingAnswer = parts[COLUMN_INDICES.READING_ANSWER]?.trim();
                if (question && readingAnswer) return { question, displayAnswer: displayAnswer || readingAnswer, readingAnswer };
                return null;
            }).filter(quiz => quiz); 

            if (quizzesFromFile.length === 0) throw new Error('有効なクイズなし');
            isQuizDataLoaded = true;
            ui.loadingMessage.style.display = 'none';
            // ▼▼▼ シード入力エリアを表示し、入力を有効化 ▼▼▼
            ui.seedInputArea.style.display = 'flex'; 
            ui.seedInput.disabled = false;
            ui.applySeedButton.disabled = false;
            // ▲▲▲ シード入力エリアを表示し、入力を有効化 ▲▲▲
            // alert("問題データの準備ができました。シード値を入力して開始してください。"); // アラートは削除

        } catch (error) {
            console.error('読み込みエラー:', error);
            ui.loadingMessage.style.display = 'none';
            ui.errorMessage.textContent = `エラー: ${error.message}`;
            ui.errorMessage.style.display = 'block';
        }
    }

    function setupQuizWithSeed(seed) {
        if (!isQuizDataLoaded) {
            alert("問題データがロードされていません。ページを再読み込みしてください。");
            return;
        }
        currentSeed = seed;
        allLoadedQuizzes = [...quizzesFromFile];
        shuffleArrayWithSeed(allLoadedQuizzes, seed);
        
        overallQuizIndex = 0;
        initializeGlobalStats();
        initializeQuizSettings(); 
        
        ui.quizArea.style.display = 'none'; 
        ui.finalScoreArea.style.display = 'none';
        // ▼▼▼ シード適用後、シード入力エリアを非表示に ▼▼▼
        ui.seedInputArea.style.display = 'none';
        // ▲▲▲ シード適用後、シード入力エリアを非表示に ▲▲▲
        startNewSession();
    }
    
    function onSlowDisplayNaturalFinish() {
        if(slowDisplayTextIntervalId) clearInterval(slowDisplayTextIntervalId);
        slowDisplayTextIntervalId = null;
        stoppedAtIndex = -1; 
        ui.stopSlowDisplayTextButton.style.display = 'none';
        ui.answerInput.disabled = false;
        ui.submitAnswer.disabled = false;
        ui.answerInput.focus();
    }

    function stopProgressiveDisplayAndEnableInput() {
        if (slowDisplayTextIntervalId) {
            clearInterval(slowDisplayTextIntervalId);
            slowDisplayTextIntervalId = null;
            stoppedAtIndex = currentDisplayedCharIndex; 
        }
        ui.stopSlowDisplayTextButton.style.display = 'none';
        ui.answerInput.disabled = false;
        ui.submitAnswer.disabled = false;
        ui.answerInput.focus();
    }

    function startSlowDisplayInterval() {
        if (slowDisplayTextIntervalId) { clearInterval(slowDisplayTextIntervalId); }
        if (currentDisplayedCharIndex >= currentQuestionFullText.length) {
            onSlowDisplayNaturalFinish(); 
            return;
        }
        slowDisplayTextIntervalId = setInterval(() => {
            if (currentDisplayedCharIndex < currentQuestionFullText.length) {
                ui.questionText.textContent += currentQuestionFullText[currentDisplayedCharIndex];
                currentDisplayedCharIndex++;
            } else {
                onSlowDisplayNaturalFinish();
            }
        }, SLOW_DISPLAY_INTERVAL_MS);
    }

    function displayQuestion() {
        ui.resultArea.style.display = 'none';
        ui.questionText.classList.remove('fade-in'); 
        void ui.questionText.offsetWidth; 
        ui.disputeButton.style.display = 'none';
        lastAnswerWasInitiallyIncorrect = false;
        stoppedAtIndex = -1;
        hintUsedThisQuestion = false;

        if (slowDisplayTextIntervalId) { clearInterval(slowDisplayTextIntervalId); slowDisplayTextIntervalId = null; }
        
        ui.hintTextDisplay.textContent = '';
        ui.hintTextDisplay.style.display = 'none'; 
        ui.hintButton.disabled = false;
        if (ui.enableHintCheckbox.checked) { ui.hintButton.style.display = 'block'; } 
        else { ui.hintButton.style.display = 'none'; }

        if (currentQuestionInSessionIndex < currentQuizSession.length) {
            const currentQuiz = currentQuizSession[currentQuestionInSessionIndex];
            currentQuestionFullText = currentQuiz.question;
            currentDisplayedCharIndex = 0;
            ui.questionText.textContent = ''; 
            ui.questionText.innerHTML = ''; 

            ui.questionNumberText.textContent = `第${currentQuestionInSessionIndex + 1}問 / ${QUESTIONS_PER_SESSION}問`;
            
            ui.answerInput.disabled = true;
            ui.submitAnswer.disabled = true;
            ui.stopSlowDisplayTextButton.style.display = 'block';
            startSlowDisplayInterval();
            
            ui.answerInput.value = '';
            ui.submitAnswer.style.display = 'inline-block';
            ui.nextQuestion.style.display = 'none';
            setTimeout(() => { ui.questionText.classList.add('fade-in'); }, 50);
        } else {
            endSession();
        }
    }

    function updateOverallCorrectRateDisplay() {
        let rate = 0; if (questionsAttemptedOverall > 0) rate = Math.round((correctAnswersOverall / questionsAttemptedOverall) * 100); ui.correctRateText.textContent = `正答率: ${rate}%`;
    }
    
    function updateAvgRevealRateDisplay() {
        if (slowDisplayAnswerCountForStat > 0) { const avg = Math.round(totalRevealPercentageSumForStat / slowDisplayAnswerCountForStat); ui.avgRevealRateText.textContent = `平均開示率: ${avg}%`; } 
        else { ui.avgRevealRateText.textContent = '平均開示率: ---'; }
    }

    function checkAnswer() {
        if (currentQuestionInSessionIndex >= currentQuizSession.length) return;
        
        let charsRevealedForCalc = currentQuestionFullText.length; 
        if (slowDisplayTextIntervalId) { 
            clearInterval(slowDisplayTextIntervalId);
            slowDisplayTextIntervalId = null;
            charsRevealedForCalc = currentDisplayedCharIndex; 
            if (stoppedAtIndex === -1) stoppedAtIndex = currentDisplayedCharIndex; 
        } else if (stoppedAtIndex !== -1) { 
            charsRevealedForCalc = stoppedAtIndex;
        } else { 
            charsRevealedForCalc = currentQuestionFullText.length;
        }
        charsRevealedForCalc = Math.min(charsRevealedForCalc, currentQuestionFullText.length);

        questionsAttemptedOverall++; 
        const userAnswer = ui.answerInput.value.trim();
        const currentQuiz = currentQuizSession[currentQuestionInSessionIndex];
        const isCorrect = userAnswer === currentQuiz.readingAnswer;
        lastAnswerWasInitiallyIncorrect = false;

        if (isCorrect) correctAnswersOverall++;
        updateOverallCorrectRateDisplay();

        let revealPercentageForScore;
        if (isCorrect) {
            revealPercentageForScore = (currentQuestionFullText.length > 0) ? (charsRevealedForCalc / currentQuestionFullText.length) * 100 : 0;
        } else { 
            revealPercentageForScore = 200;
        }
        let baseScore = MAX_POINTS_PER_QUESTION_BASE - (revealPercentageForScore * REVEAL_PENALTY_PER_PERCENT);
        if(revealPercentageForScore === 200) baseScore = 0;
        if(!isCorrect) baseScore = 0;

        let questionScore = baseScore;
        if (hintUsedThisQuestion) questionScore *= HINT_PENALTY_FACTOR;
        if (!ui.showStoneImageCheckbox.checked) questionScore *= IMAGE_HIDDEN_PENALTY_FACTOR;
        if (!isCorrect) questionScore = 0;

        sessionRawScore += questionScore;
        ui.currentScoreText.textContent = `現在スコア: ${Math.round(sessionRawScore)}`;

        let revealStatPercentage;
        if (isCorrect) {
            revealStatPercentage = (currentQuestionFullText.length > 0) ? (charsRevealedForCalc / currentQuestionFullText.length) * 100 : 0;
        } else {
            revealStatPercentage = 100;
        }
        totalRevealPercentageSumForStat += revealStatPercentage;
        slowDisplayAnswerCountForStat++;
        updateAvgRevealRateDisplay();
        
        if (isCorrect) { ui.resultText.textContent = '正解！ 🎉'; ui.resultText.className = 'correct'; ui.disputeButton.style.display = 'none'; } 
        else { ui.resultText.textContent = '不正解... 😢'; ui.resultText.className = 'incorrect'; ui.disputeButton.style.display = 'inline-block'; lastAnswerWasInitiallyIncorrect = true; }
        let correctAnswerFormatted = `「${currentQuiz.readingAnswer}」`;
        if (currentQuiz.displayAnswer && currentQuiz.displayAnswer !== currentQuiz.readingAnswer) { correctAnswerFormatted = `「${currentQuiz.readingAnswer} (${currentQuiz.displayAnswer})」`; }
        ui.correctAnswerText.textContent = isCorrect ? '' : `正解は ${correctAnswerFormatted} です。`;
        
        ui.questionText.textContent = currentQuestionFullText;
        if (stoppedAtIndex > 0 && stoppedAtIndex < currentQuestionFullText.length) {
            const preText = currentQuestionFullText.substring(0, stoppedAtIndex);
            const postText = currentQuestionFullText.substring(stoppedAtIndex);
            ui.questionText.innerHTML = `<span class="stopped-text-segment">${preText}</span>${postText}`;
        }

        ui.answerInput.disabled = true; ui.submitAnswer.disabled = true;
        ui.nextQuestion.style.display = 'inline-block'; ui.resultArea.style.display = 'block';
        ui.nextQuestion.focus(); 
    }

    function endSession() {
        ui.quizArea.style.display = 'none'; ui.resultArea.style.display = 'none'; 
        
        const maxPossibleBaseScorePerQuestion = MAX_POINTS_PER_QUESTION_BASE - (0 * REVEAL_PENALTY_PER_PERCENT);
        const maxTotalSessionRawScore = maxPossibleBaseScorePerQuestion * QUESTIONS_PER_SESSION;
        
        let normalizedScore = 0;
        if (maxTotalSessionRawScore > 0) {
            normalizedScore = (sessionRawScore / maxTotalSessionRawScore) * 100;
        }
        normalizedScore = Math.max(0, Math.min(100, Math.round(normalizedScore)));

        ui.finalNormalizedScoreText.textContent = `最終スコア: ${normalizedScore} / 100`;
        ui.finalRawScoreText.textContent = `(あなたのポイント: ${Math.round(sessionRawScore)})`;

        let message = "";
        if (normalizedScore >= 95) message = "完璧です！素晴らしい！ 😮🎉";
        else if (normalizedScore >= 80) message = "高得点！お見事です！👏";
        else if (normalizedScore >= 60) message = "よくできました！😊";
        else if (normalizedScore >= 40) message = "まずまずですね！👍";
        else message = "もう少し頑張りましょう🤡";
        ui.finalScoreMessage.textContent = message;

        ui.finalScoreArea.style.display = 'block';
        ui.hintAreaContainer.style.display = 'none'; 
    }

    function handleDispute() {
        if (!lastAnswerWasInitiallyIncorrect) return; 
        correctAnswersOverall++; 
        updateOverallCorrectRateDisplay(); 
        ui.resultText.textContent = '判定変更:🤡 ところで、不正してませんか?'; 
        ui.resultText.className = 'correct'; 
        ui.disputeButton.style.display = 'none'; 
        lastAnswerWasInitiallyIncorrect = false;
    }
    
    function handleHintClick() {
        if (currentQuestionInSessionIndex < currentQuizSession.length) {
            const correctAnswerReading = currentQuizSession[currentQuestionInSessionIndex].readingAnswer;
            if (correctAnswerReading && correctAnswerReading.length > 0) {
                const firstChar = correctAnswerReading[0]; const length = correctAnswerReading.length;
                ui.hintTextDisplay.textContent = `ヒント: 最初の1文字「${firstChar}」(${length}文字)`;
                ui.hintTextDisplay.style.display = 'block'; ui.hintButton.disabled = true; hintUsedThisQuestion = true;
            }
        }
    }

    // Event Listeners
    ui.submitAnswer.addEventListener('click', checkAnswer);
    ui.answerInput.addEventListener('keypress', e => { if (e.key === 'Enter' && !ui.answerInput.disabled) checkAnswer(); });
    ui.nextQuestion.addEventListener('click', () => { 
        currentQuestionInSessionIndex++;
        displayQuestion(); 
    });
    ui.disputeButton.addEventListener('click', handleDispute);
    ui.stopSlowDisplayTextButton.addEventListener('click', stopProgressiveDisplayAndEnableInput);
    ui.hintButton.addEventListener('click', handleHintClick);
    ui.showStoneImageCheckbox.addEventListener('change', () => {
        if (ui.showStoneImageCheckbox.checked) { ui.stoneImage.style.display = ''; } 
        else { ui.stoneImage.style.display = 'none'; }
    });
    ui.playAgainButton.addEventListener('click', () => {
        // ▼▼▼ シード入力エリアを再度表示し、クイズ関連エリアを非表示に ▼▼▼
        ui.seedInputArea.style.display = 'flex';
        ui.seedInput.disabled = false;
        ui.applySeedButton.disabled = false;
        ui.applySeedButton.style.display = 'inline-block'; // 表示
        ui.finalScoreArea.style.display = 'none';
        ui.quizArea.style.display = 'none'; // クイズエリアも隠す
        ui.quizEndMessage.style.display = 'none';
        alert("新しいシード値を入力して「シード適用＆開始」を押してください。\n同じシードを使うと、前回と同じ問題順になります。");
        ui.seedInput.value = ''; // シード入力欄をクリア
        ui.seedInput.focus();
        // ▲▲▲ シード入力エリアを再度表示し、クイズ関連エリアを非表示に ▲▲▲
    });
    
    ui.applySeedButton.addEventListener('click', () => {
        const seedValue = ui.seedInput.value.trim();
        if (seedValue) {
            setupQuizWithSeed(seedValue);
        } else {
            const randomSeed = Math.floor(Math.random() * 10000000000).toString();
            if(window.confirm(`シードが空です。ランダムなシード「${randomSeed}」で開始しますか？\nキャンセルすると入力に戻ります。`)){
                ui.seedInput.value = randomSeed;
                setupQuizWithSeed(randomSeed);
            } else {
                ui.seedInput.focus();
            }
        }
    });
    
    ui.enableHintCheckbox.addEventListener('change', () => {
        if (ui.enableHintCheckbox.checked) {
            ui.hintAreaContainer.style.display = 'block'; 
            // クイズがアクティブな場合のみヒントボタンを表示する制御は displayQuestion 内で行う
            if(currentQuestionInSessionIndex < currentQuizSession.length && currentQuizSession.length > 0) {
               ui.hintButton.style.display = 'block';
            }
        } else {
            ui.hintAreaContainer.style.display = 'none';
        }
    });

    // Initial setup
    ui.seedInputArea.style.display = 'none'; // 初期はシードエリアを隠す
    preloadQuizData();
});
