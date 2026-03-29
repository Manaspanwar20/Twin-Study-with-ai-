import React, { useState } from 'react';

const QuizCard = ({ quizData, initialSession = null, onSessionUpdate = null }) => {
  // Initialize state from existing session or defaults
  const [currentStep, setCurrentStep] = useState(initialSession?.currentStep || 0);
  const [selectedOption, setSelectedOption] = useState(initialSession?.selectedOption !== undefined ? initialSession.selectedOption : null);
  const [showResult, setShowResult] = useState(initialSession?.showResult || false);
  const [score, setScore] = useState(initialSession?.score || 0);
  const [isFinished, setIsFinished] = useState(initialSession?.isFinished || false);

  const questions = quizData?.questions || [];
  const currentQuestion = questions[currentStep];

  const updateSession = (newSess) => {
    if (onSessionUpdate) {
      onSessionUpdate({
          currentStep,
          selectedOption,
          showResult,
          score,
          isFinished,
          ...newSess
      });
    }
  };

  const handleOptionSelect = (idx) => {
    if (showResult) return;
    setSelectedOption(idx);
  };

  const handleCheck = () => {
    if (selectedOption === null) return;
    
    let newScore = score;
    if (selectedOption === currentQuestion.correctIndex) {
      newScore += 1;
      setScore(newScore);
    }
    setShowResult(true);
    updateSession({ showResult: true, selectedOption, score: newScore });
  };

  const handleNext = () => {
    if (currentStep < questions.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setSelectedOption(null);
      setShowResult(false);
      updateSession({ currentStep: nextStep, selectedOption: null, showResult: false });
    } else {
      setIsFinished(true);
      updateSession({ isFinished: true });
    }
  };

  if (!currentQuestion && !isFinished) return <div className="quiz-error">No questions found.</div>;

  if (isFinished) {
    return (
      <div className="quiz-result-screen fade-in">
        <div className="quiz-score-circle">
          <span className="quiz-score-num">{score}/{questions.length}</span>
        </div>
        <h3>Quiz Completed!</h3>
        <p>{score === questions.length ? "Perfect score! You've mastered this topic." : "Good effort! Keep studying to improve your score."}</p>
        <button className="quiz-action-btn" style={{marginTop: '20px'}} onClick={() => {
            setCurrentStep(0);
            setSelectedOption(null);
            setShowResult(false);
            setScore(0);
            setIsFinished(false);
            updateSession({ currentStep: 0, selectedOption: null, showResult: false, score: 0, isFinished: false });
        }}>Retake Quiz</button>
      </div>
    );
  }

  return (
    <div className="quiz-card fade-in">
      <div className="quiz-header">
        <span className="quiz-badge">Question {currentStep + 1} of {questions.length}</span>
        <div className="quiz-progress-bar-small">
          <div 
            className="quiz-progress-fill-small" 
            style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <h3 className="quiz-question">{currentQuestion.question}</h3>

      <div className="quiz-options">
        {currentQuestion.options.map((option, idx) => {
          let stateClass = "";
          if (showResult) {
            if (idx === currentQuestion.correctIndex) stateClass = "correct";
            else if (idx === selectedOption) stateClass = "incorrect";
          } else if (idx === selectedOption) {
            stateClass = "selected";
          }

          return (
            <button
              key={idx}
              className={`quiz-option ${stateClass}`}
              onClick={() => handleOptionSelect(idx)}
              disabled={showResult}
            >
              <span className="quiz-option-letter">{String.fromCharCode(65 + idx)}</span>
              <span className="quiz-option-text">{option}</span>
              {showResult && idx === currentQuestion.correctIndex && <span className="quiz-check-icon">✓</span>}
            </button>
          );
        })}
      </div>

      {showResult && (
        <div className="quiz-explanation fade-in">
          <p><strong>Explanation:</strong> {currentQuestion.explanation}</p>
        </div>
      )}

      <div className="quiz-footer">
        {!showResult ? (
          <button 
            className="quiz-action-btn" 
            onClick={handleCheck}
            disabled={selectedOption === null}
          >
            Check Answer
          </button>
        ) : (
          <button className="quiz-action-btn next" onClick={handleNext}>
            {currentStep < questions.length - 1 ? "Next Question" : "Finish Quiz"}
          </button>
        )}
      </div>
    </div>
  );
};

export default QuizCard;
