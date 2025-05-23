document.addEventListener('DOMContentLoaded', () => {
    const ui = {
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
        // enableSlowDisplayTextCheckbox は削除
        stopSlowDisplayTextButton: document.getElementById('stopSlowDisplayTextButton'),
        // speedControlArea, slowDisplayTextSpeedSlider, speedValueDisplay は削除
        enableHintCheckbox: document.getElementById('enableHintCheckbox'),
        hintAreaContainer: document.querySelector('.hint-area-container'),
        hintButton: document.getElementById('hintButton'),
        hintTextDisplay: document.getElementById('hintTextDisplay'),
        showStoneImageCheckbox: document.getElementById('showStoneImageCheckbox'),
        stoneImage: document.getElementById('stoneImage'),
        currentScoreText: document.getElementById('currentScoreText'),
        finalScoreArea: document.getElementById('finalScoreArea'),
        finalNormalizedScoreText: document.getElementById('finalNormalizedScoreText'),
        finalRawScoreText: document.getElementById('finalRawScoreText'), // ▼▼▼ 追加 ▼▼▼
        finalScoreMessage: document.getElementById('finalScoreMessage'), // ▼▼▼ 追加 ▼▼▼
        playAgainButton: document.getElementById('playAgainButton')
    };

    const CSV_FILE_PATH = 'みんはや問題リストv1.27 - 問題リスト.csv';
    const COLUMN_INDICES = { QUESTION: 0, DISPLAY_ANSWER: 1, READING_ANSWER: 2 };
    const QUESTIONS_PER_SESSION = 10;
    const SCORE_CONSTANT = 1;
    const SLOW_DISPLAY_INTERVAL_MS = 180; // ▼▼▼ 固定速度 ▼▼▼

    let allLoadedQuizzes = [];
    let currentQuizSession = [];
    let overallQuizIndex = 0;

    let currentQuestionInSessionIndex = 0;
    let sessionRawScore = 0;
    let hintUsedThisQuestion = false;
    // isSlowReadActiveThisQuestion は常にtrueなので不要に

    let slowDisplayTextIntervalId = null;
    let currentQuestionFullText = '';
    let currentDisplayedCharIndex = 0;
    let stoppedAtIndex = -1;

    let correctAnswersOverall = 0;
    let questionsAttemptedOverall = 0;
    let totalRevealPercentageSumForStat = 0;
    let slowDisplayAnswerCountForStat = 0;

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function initializeGlobalStats() {
        correctAnswersOverall = 0;
        questionsAttemptedOverall = 0;
        totalRevealPercentageSumForStat = 0;
        slowDisplayAnswerCountForStat = 0;
        ui.correctRateText.textContent = '正答率: ---';
        ui.avgRevealRateText.textContent = '平均開示率: ---';
    }
    
    function startNewSession() {
        currentQuizSession = allLoadedQuizzes.slice(overallQuizIndex, overallQuizIndex + QUESTIONS_PER_SESSION);
        overallQuizIndex += currentQuizSession.length;

        if (currentQuizSession.length === 0) {
            ui.quizArea.style.display = 'none';
            ui.finalScoreArea.style.display = 'none';
            ui.quizEndMessage.textContent = '全てのクイズデータで遊び尽くしました！ありがとう！';
            ui.quizEndMessage.style.display = 'block';
            return;
        }
        
        currentQuestionInSessionIndex = 0;
        sessionRawScore = 0;
        ui.currentScoreText.textContent = `現在スコア: 0`;
        ui.finalScoreArea.style.display = 'none';
        ui.quizArea.style.display = 'block';
        ui.quizEndMessage.style.display = 'none';

        displayQuestion();
    }

    function initializeQuizSettings() { // チェックボックスの初期設定のみ
        if (ui.enableHintCheckbox.checked) { ui.hintAreaContainer.style.display = 'block'; }
        else { ui.hintAreaContainer.style.display = 'none'; }

        if (ui.showStoneImageCheckbox.checked) { ui.stoneImage.style.display = ''; }
        else { ui.stoneImage.style.display = 'none'; }
    }

    async function loadAllQuizzesAndStart() {
        try {
            ui.loadingMessage.style.display = 'block';
            ui.errorMessage.style.display = 'none';
            ui.correctRateText.textContent = '正答率: ---';
            ui.avgRevealRateText.textContent = '平均開示率: ---';


            const response = await fetch(CSV_FILE_PATH);
            if (!response.ok) throw new Error(`CSVエラー (${response.status})`);
            let csvText = await response.text();
            if (csvText.startsWith('\uFEFF')) csvText = csvText.substring(1);
            const lines = csvText.trim().split(/\r?\n/);
            if (lines.length <= 1) throw new Error('CSVデータなし');

            allLoadedQuizzes = lines.slice(1).map(line => {
                const parts = line.split(',');
                const question = parts[COLUMN_INDICES.QUESTION]?.trim();
                const displayAnswer = parts[COLUMN_INDICES.DISPLAY_ANSWER]?.trim();
                const readingAnswer = parts[COLUMN_INDICES.READING_ANSWER]?.trim();
                if (question && readingAnswer) return { question, displayAnswer: displayAnswer || readingAnswer, readingAnswer };
                return null;
            }).filter(quiz => quiz); 

            if (allLoadedQuizzes.length === 0) throw new Error('有効なクイズなし');
            shuffleArray(allLoadedQuizzes); 
            
            overallQuizIndex = 0;
            initializeGlobalStats();
            initializeQuizSettings(); // ページロード時の設定適用
            
            ui.loadingMessage.style.display = 'none';
            startNewSession();

        } catch (error) {
            console.error('読み込みエラー:', error);
            ui.loadingMessage.style.display = 'none';
            ui.errorMessage.textContent = `エラー: ${error.message}`;
            ui.errorMessage.style.display = 'block';
        }
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

    // startOrRestartSlowDisplayInterval は速度固定のため簡略化
    function startSlowDisplayInterval() {
        if (slowDisplayTextIntervalId) { clearInterval(slowDisplayTextIntervalId); }
        // const displaySpeedMs = SLOW_DISPLAY_INTERVAL_MS; // 固定値を使用
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
        }, SLOW_DISPLAY_INTERVAL_MS); // 固定速度を使用
    }

    function displayQuestion() {
        ui.resultArea.style.display = 'none';
        ui.questionText.classList.remove('fade-in');
        void ui.questionText.offsetWidth; 
        ui.disputeButton.style.display = 'none';
        lastAnswerWasInitiallyIncorrect = false;
        stoppedAtIndex = -1;
        hintUsedThisQuestion = false;
        // isSlowReadActiveThisQuestion は常に true

        if (slowDisplayTextIntervalId) { clearInterval(slowDisplayTextIntervalId); slowDisplayTextIntervalId = null; }
        // ui.stopSlowDisplayTextButton はゆっくり表示開始時に制御

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
            
            // ゆっくり表示は常に有効
            ui.answerInput.disabled = true;
            ui.submitAnswer.disabled = true;
            ui.stopSlowDisplayTextButton.style.display = 'block';
            startSlowDisplayInterval(); // 速度固定のゆっくり表示開始
            
            ui.answerInput.value = '';
            // フォーカスは onSlowDisplayNaturalFinish か stopProgressiveDisplayAndEnableInput で
            ui.submitAnswer.style.display = 'inline-block';
            ui.nextQuestion.style.display = 'none';
            ui.questionText.classList.add('fade-in');
        } else {
            endSession();
        }
    }

    function updateOverallCorrectRateDisplay() {
        let rate = 0; if (questionsAttemptedOverall > 0) rate = Math.round((correctAnswersOverall / questionsAttemptedOverall) * 100); ui.correctRateText.textContent = `正答率: ${rate}%`;
    }
    
    function updateAvgRevealRateDisplay() {
        if (slowDisplayAnswerCountForStat > 0) {
            const avg = Math.round(totalRevealPercentageSumForStat / slowDisplayAnswerCountForStat);
            ui.avgRevealRateText.textContent = `平均開示率: ${avg}%`;
        } else {
            ui.avgRevealRateText.textContent = '平均開示率: ---';
        }
    }

    function checkAnswer() {
        if (currentQuestionInSessionIndex >= currentQuizSession.length) return;
        
        let charsRevealedForCalc = currentQuestionFullText.length;
        // ゆっくり表示が前提なので、停止状態に基づいて開示文字数を計算
        if (slowDisplayTextIntervalId) { // Enterキーなどで回答し、インターバルがまだ動いていた場合
            clearInterval(slowDisplayTextIntervalId);
            slowDisplayTextIntervalId = null;
            charsRevealedForCalc = currentDisplayedCharIndex; 
            if (stoppedAtIndex === -1) stoppedAtIndex = currentDisplayedCharIndex; 
        } else if (stoppedAtIndex !== -1) { // 「表示停止」ボタンで停止した場合
            charsRevealedForCalc = stoppedAtIndex;
        } else { // ゆっくり表示が自然に完了した場合
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

        // スコア計算
        let revealPercentageForScoreFormula;
        if (isCorrect) {
            // ゆっくり表示は常時なので、常にこの計算
            revealPercentageForScoreFormula = (currentQuestionFullText.length > 0) ? (charsRevealedForCalc / currentQuestionFullText.length) * 100 : 0;
        } else { 
            revealPercentageForScoreFormula = 200;
        }
        const baseScoreTerm = 200 - revealPercentageForScoreFormula;
        const hintFactor = hintUsedThisQuestion ? 0.5 : 1.0;
        const correctnessFactor = isCorrect ? 1 : 0;
        const questionScore = baseScoreTerm * SCORE_CONSTANT * hintFactor * correctnessFactor;
        sessionRawScore += questionScore;
        ui.currentScoreText.textContent = `現在スコア: ${Math.round(sessionRawScore)}`;

        // 平均開示率の統計更新 (ゆっくり表示は常になので、常に計算対象)
        let revealStatPercentage;
        if (isCorrect) {
            revealStatPercentage = (currentQuestionFullText.length > 0) ? (charsRevealedForCalc / currentQuestionFullText.length) * 100 : 0;
        } else {
            revealStatPercentage = 100;
        }
        totalRevealPercentageSumForStat += revealStatPercentage;
        slowDisplayAnswerCountForStat++;
        updateAvgRevealRateDisplay();
        
        if (isCorrect) {
            ui.resultText.textContent = '正解！ 🎉';
            ui.resultText.className = 'correct';
            ui.disputeButton.style.display = 'none';
        } else {
            ui.resultText.textContent = '不正解... 😢';
            ui.resultText.className = 'incorrect';
            ui.disputeButton.style.display = 'inline-block';
            lastAnswerWasInitiallyIncorrect = true;
        }
        let correctAnswerFormatted = `「${currentQuiz.readingAnswer}」`;
        if (currentQuiz.displayAnswer && currentQuiz.displayAnswer !== currentQuiz.readingAnswer) {
            correctAnswerFormatted = `「${currentQuiz.readingAnswer} (${currentQuiz.displayAnswer})」`;
        }
        ui.correctAnswerText.textContent = isCorrect ? '' : `正解は ${correctAnswerFormatted} です。`;
        
        ui.questionText.textContent = currentQuestionFullText;
        if (stoppedAtIndex > 0 && stoppedAtIndex < currentQuestionFullText.length) {
            const preText = currentQuestionFullText.substring(0, stoppedAtIndex);
            const postText = currentQuestionFullText.substring(stoppedAtIndex);
            ui.questionText.innerHTML = `<span class="stopped-text-segment">${preText}</span>${postText}`;
        }

        ui.answerInput.disabled = true;
        ui.submitAnswer.disabled = true;
        ui.nextQuestion.style.display = 'inline-block';
        ui.resultArea.style.display = 'block';
        ui.nextQuestion.focus(); 
    }

    function endSession() {
        ui.quizArea.style.display = 'none';
        ui.resultArea.style.display = 'none'; 
        
        const maxPossibleRawScorePerQuestion = (200 - 0) * SCORE_CONSTANT * 1.0;
        const maxTotalSessionRawScore = maxPossibleRawScorePerQuestion * QUESTIONS_PER_SESSION;
        
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
        else message = "もう少し頑張りましょう！💪";
        ui.finalScoreMessage.textContent = message;

        ui.finalScoreArea.style.display = 'block';
        ui.hintAreaContainer.style.display = 'none';
    }

    function handleDispute() {
        if (!lastAnswerWasInitiallyIncorrect) return; 
        correctAnswersOverall++; 
        updateOverallCorrectRateDisplay(); 
        ui.resultText.textContent = '判定変更: 正解！ 🎉'; 
        ui.resultText.className = 'correct'; 
        ui.disputeButton.style.display = 'none'; 
        lastAnswerWasInitiallyIncorrect = false;
    }
    
    function handleHintClick() {
        if (currentQuestionInSessionIndex < currentQuizSession.length) {
            const correctAnswerReading = currentQuizSession[currentQuestionInSessionIndex].readingAnswer;
            if (correctAnswerReading && correctAnswerReading.length > 0) {
                const firstChar = correctAnswerReading[0];
                const length = correctAnswerReading.length;
                ui.hintTextDisplay.textContent = `ヒント: 最初の1文字「${firstChar}」(${length}文字)`;
                ui.hintTextDisplay.style.display = 'block';
                ui.hintButton.disabled = true; 
                hintUsedThisQuestion = true;
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
        if (overallQuizIndex >= allLoadedQuizzes.length && currentQuizSession.length < QUESTIONS_PER_SESSION ) { // 最後のセッションが10問未満で終わった場合も含む
            alert("全てのクイズ問題をプレイしました！最初からロードし直します。");
            loadAllQuizzesAndStart(); 
        } else {
            startNewSession();
        }
    });

    // enableSlowDisplayTextCheckbox と slowDisplayTextSpeedSlider のリスナーは削除
    
    ui.enableHintCheckbox.addEventListener('change', () => {
        if (ui.enableHintCheckbox.checked) {
            ui.hintAreaContainer.style.display = 'block'; 
            if(currentQuestionInSessionIndex < currentQuizSession.length && totalQuestions > 0) { // totalQuestionsは古いかも、currentQuizSession.lengthで判断
               ui.hintButton.style.display = 'block';
            }
        } else {
            ui.hintAreaContainer.style.display = 'none';
        }
    });

    loadAllQuizzesAndStart(); // 初回ロードとセッション開始
});
