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
        quizEndMessage: document.getElementById('quizEndMessage'), // 全CSV終了時のメッセージ用
        quizArea: document.getElementById('quizArea'),
        resultArea: document.getElementById('resultArea'),
        correctRateText: document.getElementById('correctRateText'),
        avgRevealRateText: document.getElementById('avgRevealRateText'),
        disputeButton: document.getElementById('disputeButton'),
        enableSlowDisplayTextCheckbox: document.getElementById('enableSlowDisplayTextCheckbox'),
        stopSlowDisplayTextButton: document.getElementById('stopSlowDisplayTextButton'),
        speedControlArea: document.getElementById('speedControlArea'),
        slowDisplayTextSpeedSlider: document.getElementById('slowDisplayTextSpeedSlider'),
        speedValueDisplay: document.getElementById('speedValueDisplay'),
        enableHintCheckbox: document.getElementById('enableHintCheckbox'),
        hintAreaContainer: document.querySelector('.hint-area-container'),
        hintButton: document.getElementById('hintButton'),
        hintTextDisplay: document.getElementById('hintTextDisplay'),
        showStoneImageCheckbox: document.getElementById('showStoneImageCheckbox'),
        stoneImage: document.getElementById('stoneImage'),
        // ▼▼▼ スコア関連UI要素追加 ▼▼▼
        currentScoreText: document.getElementById('currentScoreText'),
        finalScoreArea: document.getElementById('finalScoreArea'),
        finalNormalizedScoreText: document.getElementById('finalNormalizedScoreText'),
        playAgainButton: document.getElementById('playAgainButton')
        // ▲▲▲ スコア関連UI要素追加 ▲▲▲
    };

    const CSV_FILE_PATH = 'みんはや問題リストv1.27 - 問題リスト.csv';
    const COLUMN_INDICES = { QUESTION: 0, DISPLAY_ANSWER: 1, READING_ANSWER: 2 };
    const QUESTIONS_PER_SESSION = 10; // ▼▼▼ 1セッションあたりの問題数 ▼▼▼
    const SCORE_CONSTANT = 1;         // ▼▼▼ スコア計算式の定数 ▼▼▼

    let allLoadedQuizzes = []; // CSVから読み込んだ全てのクイズ
    let currentQuizSession = []; // 現在の10問セッション用のクイズ
    let overallQuizIndex = 0; // allLoadedQuizzesのどこまで使用したかのインデックス

    // セッションごとの状態変数
    let currentQuestionInSessionIndex = 0; //現在のセッションで何問目か (0-9)
    let sessionRawScore = 0;
    let hintUsedThisQuestion = false;
    let isSlowReadActiveThisQuestion = false; // displayQuestion時に設定

    // ゆっくり表示関連
    let slowDisplayTextIntervalId = null;
    let currentQuestionFullText = '';
    let currentDisplayedCharIndex = 0;
    let stoppedAtIndex = -1;

    // 統計用 (正答率、平均開示率)
    let correctAnswersOverall = 0; // 全体での正解数 (正答率用)
    let questionsAttemptedOverall = 0; // 全体での試行数 (正答率用)
    let totalRevealPercentageSumForStat = 0; // 平均開示率統計用
    let slowDisplayAnswerCountForStat = 0;  // 平均開示率統計用

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function initializeGlobalStats() { // ページロード時や完全リセット時に呼ぶ
        correctAnswersOverall = 0;
        questionsAttemptedOverall = 0;
        totalRevealPercentageSumForStat = 0;
        slowDisplayAnswerCountForStat = 0;
        ui.correctRateText.textContent = '正答率: ---';
        ui.avgRevealRateText.textContent = '平均開示率: ---';
    }
    
    function startNewSession() {
        currentQuizSession = allLoadedQuizzes.slice(overallQuizIndex, overallQuizIndex + QUESTIONS_PER_SESSION);
        overallQuizIndex += currentQuizSession.length; // 使用した分進める

        if (currentQuizSession.length === 0) {
            ui.quizArea.style.display = 'none';
            ui.finalScoreArea.style.display = 'none';
            ui.quizEndMessage.textContent = '全てのクイズが終了しました！お疲れ様でした。';
            ui.quizEndMessage.style.display = 'block';
            return;
        }
        
        currentQuestionInSessionIndex = 0;
        sessionRawScore = 0;
        ui.currentScoreText.textContent = `現在スコア: 0`;
        ui.finalScoreArea.style.display = 'none';
        ui.quizArea.style.display = 'block'; // クイズエリア表示
        ui.quizEndMessage.style.display = 'none'; // 終了メッセージ隠す

        displayQuestion();
    }


    function initializeQuizSettings() { // 初回および「もう一度」の時にも呼ぶ設定部分
        const useSlowRead = ui.enableSlowDisplayTextCheckbox.disabled ? ui.enableSlowDisplayTextCheckbox.checked : window.confirm("問題文をゆっくり表示する機能を使用しますか？\n（この設定は後でチェックボックスから変更できます）");
        ui.enableSlowDisplayTextCheckbox.checked = useSlowRead;
        ui.enableSlowDisplayTextCheckbox.disabled = true; // 初回確認後は変更不可にするか、毎回確認するか。ここでは初回のみ。

        if (useSlowRead) { ui.speedControlArea.style.display = 'flex'; } 
        else { ui.speedControlArea.style.display = 'none'; }
        ui.speedValueDisplay.textContent = `${ui.slowDisplayTextSpeedSlider.value}ms`;

        if (ui.enableHintCheckbox.checked) { ui.hintAreaContainer.style.display = 'block'; }
        else { ui.hintAreaContainer.style.display = 'none'; }

        if (ui.showStoneImageCheckbox.checked) { ui.stoneImage.style.display = ''; }
        else { ui.stoneImage.style.display = 'none'; }
    }


    async function loadAllQuizzesAndStart() {
        try {
            ui.loadingMessage.style.display = 'block';
            ui.errorMessage.style.display = 'none';
            // (他のUI初期化)

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
            
            overallQuizIndex = 0; // 全体インデックスリセット
            initializeGlobalStats(); // 全体統計リセット
            initializeQuizSettings(); // チェックボックスなどの設定
            
            ui.loadingMessage.style.display = 'none';
            startNewSession(); // 最初の10問セッション開始

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

    function startOrRestartSlowDisplayInterval() {
        if (slowDisplayTextIntervalId) { clearInterval(slowDisplayTextIntervalId); }
        const displaySpeedMs = parseInt(ui.slowDisplayTextSpeedSlider.value, 10);
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
        }, displaySpeedMs);
    }

    function displayQuestion() {
        ui.resultArea.style.display = 'none';
        // ui.quizEndMessage はセッション終了時ではなく全クイズ終了時なのでここでは触らない
        ui.questionText.classList.remove('fade-in');
        void ui.questionText.offsetWidth; 
        ui.disputeButton.style.display = 'none';
        lastAnswerWasInitiallyIncorrect = false;
        stoppedAtIndex = -1;
        hintUsedThisQuestion = false; // ヒント使用状況リセット
        isSlowReadActiveThisQuestion = ui.enableSlowDisplayTextCheckbox.checked;


        if (slowDisplayTextIntervalId) { clearInterval(slowDisplayTextIntervalId); slowDisplayTextIntervalId = null; }
        ui.stopSlowDisplayTextButton.style.display = 'none';

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
            
            if (isSlowReadActiveThisQuestion) {
                ui.answerInput.disabled = true;
                ui.submitAnswer.disabled = true;
                ui.stopSlowDisplayTextButton.style.display = 'block';
                startOrRestartSlowDisplayInterval();
            } else {
                ui.questionText.textContent = currentQuestionFullText;
                ui.answerInput.disabled = false;
                ui.submitAnswer.disabled = false;
            }
            
            ui.answerInput.value = '';
            if (!isSlowReadActiveThisQuestion || !slowDisplayTextIntervalId) { 
                 ui.answerInput.focus();
            }
            ui.submitAnswer.style.display = 'inline-block';
            ui.nextQuestion.style.display = 'none';
            ui.questionText.classList.add('fade-in');
        } else { // 10問セッション終了
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
        // この問題でゆっくり表示が有効だった場合のみ、実際の開示文字数を計算
        if (isSlowReadActiveThisQuestion) {
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
        }

        questionsAttemptedOverall++; 
        const userAnswer = ui.answerInput.value.trim();
        const currentQuiz = currentQuizSession[currentQuestionInSessionIndex];
        const isCorrect = userAnswer === currentQuiz.readingAnswer;
        lastAnswerWasInitiallyIncorrect = false;

        // 統計用の正答率更新
        if (isCorrect) correctAnswersOverall++;
        updateOverallCorrectRateDisplay();

        // スコア計算
        let revealPercentageForScoreFormula;
        if (isCorrect) {
            if (isSlowReadActiveThisQuestion) {
                revealPercentageForScoreFormula = (currentQuestionFullText.length > 0) ? (charsRevealedForCalc / currentQuestionFullText.length) * 100 : 0;
            } else { // ゆっくり表示未使用で正解
                revealPercentageForScoreFormula = 0;
            }
        } else { // 不正解
            revealPercentageForScoreFormula = 200;
        }

        const baseScoreTerm = 200 - revealPercentageForScoreFormula;
        const hintFactor = hintUsedThisQuestion ? 0.5 : 1.0;
        const correctnessFactor = isCorrect ? 1 : 0;
        const questionScore = baseScoreTerm * SCORE_CONSTANT * hintFactor * correctnessFactor;
        sessionRawScore += questionScore;
        ui.currentScoreText.textContent = `現在スコア: ${Math.round(sessionRawScore)}`;


        // 平均開示率の統計更新 (ゆっくり表示利用時のみ)
        if (isSlowReadActiveThisQuestion) {
            let revealStatPercentage;
            if (isCorrect) {
                revealStatPercentage = (currentQuestionFullText.length > 0) ? (charsRevealedForCalc / currentQuestionFullText.length) * 100 : 0;
            } else {
                revealStatPercentage = 100; // 誤答時は100%扱い
            }
            totalRevealPercentageSumForStat += revealStatPercentage;
            slowDisplayAnswerCountForStat++;
            updateAvgRevealRateDisplay();
        }
        
        // 結果表示
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
        if (isSlowReadActiveThisQuestion && stoppedAtIndex > 0 && stoppedAtIndex < currentQuestionFullText.length) {
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
        ui.resultArea.style.display = 'none'; // 個別の結果表示も隠す
        
        const maxPossibleRawScorePerQuestion = (200 - 0) * SCORE_CONSTANT * 1.0; // 0%開示、ヒントなしが最高
        const maxTotalSessionRawScore = maxPossibleRawScorePerQuestion * QUESTIONS_PER_SESSION;
        
        let normalizedScore = 0;
        if (maxTotalSessionRawScore > 0) { // 0除算を避ける
            normalizedScore = (sessionRawScore / maxTotalSessionRawScore) * 100;
        }
        normalizedScore = Math.max(0, Math.min(100, Math.round(normalizedScore))); // 0-100の範囲に収め、整数にする

        ui.finalNormalizedScoreText.textContent = `最終スコア: ${normalizedScore} / 100`;
        ui.finalScoreArea.style.display = 'block';
        ui.hintAreaContainer.style.display = 'none'; // セッション終了時はヒントも隠す
    }


    function handleDispute() {
        if (!lastAnswerWasInitiallyIncorrect) return; 
        correctAnswersOverall++; // 全体の正答率に影響
        // sessionRawScore はここでは変更しない（不服は正答率のみに影響し、スコアは最初の判定通りとするか、再計算するか。今回はスコアは変更しない）
        // もしスコアも変更するなら、ここで再計算ロジックが必要
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
                hintUsedThisQuestion = true; // ▼▼▼ ヒント使用を記録 ▼▼▼
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
    ui.playAgainButton.addEventListener('click', () => { // ▼▼▼ もう一度挑戦ボタン ▼▼▼
        // initializeQuizSettings(); // 設定は維持または再確認
        // overallQuizIndex は次の10問のために既に更新されているか、または全問リシャッフルするか
        // 今回はシンプルに次の10問へ (もしallLoadedQuizzesが尽きたら loadAllQuizzesAndStart を呼ぶ)
        if (overallQuizIndex >= allLoadedQuizzes.length) {
            alert("全てのクイズ問題をプレイしました！最初からロードし直します。");
            loadAllQuizzesAndStart(); // 全ての問題をプレイし尽くしたら、再度全ロード&シャッフル
        } else {
            startNewSession();
        }
    });

    ui.enableSlowDisplayTextCheckbox.addEventListener('change', () => {
        isSlowReadActiveThisQuestion = ui.enableSlowDisplayTextCheckbox.checked; // 即時反映
        if (ui.enableSlowDisplayTextCheckbox.checked) {
            ui.speedControlArea.style.display = 'flex';
            // もし問題表示中にチェックされたら、その問題からゆっくり表示を適用するかどうか
            // 現在は次の問題から適用される。即時適用は displayQuestion の再呼び出しなど複雑になる
        } else {
            ui.speedControlArea.style.display = 'none';
            if (slowDisplayTextIntervalId) { 
                clearInterval(slowDisplayTextIntervalId);
                slowDisplayTextIntervalId = null;
                ui.questionText.textContent = currentQuestionFullText;
                ui.stopSlowDisplayTextButton.style.display = 'none';
                ui.answerInput.disabled = false;
                ui.submitAnswer.disabled = false;
                if (currentQuestionInSessionIndex < currentQuizSession.length) ui.answerInput.focus();
            }
        }
    });

    ui.slowDisplayTextSpeedSlider.addEventListener('input', () => {
        const newSpeed = ui.slowDisplayTextSpeedSlider.value;
        ui.speedValueDisplay.textContent = `${newSpeed}ms`;
        if (slowDisplayTextIntervalId) { 
            startOrRestartSlowDisplayInterval(); 
        }
    });

    ui.enableHintCheckbox.addEventListener('change', () => {
        if (ui.enableHintCheckbox.checked) {
            ui.hintAreaContainer.style.display = 'block'; 
            if(currentQuestionInSessionIndex < currentQuizSession.length && totalQuestions > 0) {
               ui.hintButton.style.display = 'block';
            }
        } else {
            ui.hintAreaContainer.style.display = 'none';
        }
    });

    // Initialize
    loadAllQuizzesAndStart(); // 初期ロード関数を変更
});
