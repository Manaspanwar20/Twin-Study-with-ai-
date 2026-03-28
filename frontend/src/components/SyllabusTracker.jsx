import React, { useState } from 'react';

const SyllabusTracker = ({ syllabus, onToggleTopic, onClose, isLoading }) => {
  const [expandedUnits, setExpandedUnits] = useState({});

  if (!syllabus && !isLoading) return null;

  const toggleUnit = (unitIndex) => {
    setExpandedUnits(prev => ({ ...prev, [unitIndex]: !prev[unitIndex] }));
  };

  const totalTopics = syllabus
    ? syllabus.units.reduce((acc, u) => acc + u.topics.length, 0)
    : 0;
  const doneTopics = syllabus
    ? syllabus.units.reduce((acc, u) => acc + u.topics.filter(t => t.done).length, 0)
    : 0;
  const progress = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

  return (
    <div className="syllabus-panel fade-in">
      <div className="syllabus-panel-header">
        <div className="syllabus-panel-title-row">
          <span className="syllabus-icon">📚</span>
          <h3 className="syllabus-title">Syllabus Tracker</h3>
          <button className="syllabus-close-btn" onClick={onClose} title="Close">×</button>
        </div>
        {syllabus && (
          <>
            <p className="syllabus-subject">{syllabus.subject}</p>
            <div className="syllabus-progress-wrap">
              <div className="syllabus-progress-bar">
                <div
                  className="syllabus-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="syllabus-progress-label">{doneTopics}/{totalTopics} done · {progress}%</span>
            </div>
          </>
        )}
      </div>

      <div className="syllabus-panel-body">
        {isLoading && (
          <div className="syllabus-loading">
            <div className="syllabus-spinner" />
            <p>Analysing syllabus…</p>
          </div>
        )}

        {syllabus && syllabus.units.map((unit, ui) => {
          const unitDone = unit.topics.filter(t => t.done).length;
          const isOpen = expandedUnits[ui] !== false; // default open
          return (
            <div key={ui} className="syllabus-unit">
              <button className="syllabus-unit-header" onClick={() => toggleUnit(ui)}>
                <span className="syllabus-unit-chevron">{isOpen ? '▾' : '▸'}</span>
                <span className="syllabus-unit-name">{unit.name}</span>
                <span className="syllabus-unit-count">{unitDone}/{unit.topics.length}</span>
              </button>
              {isOpen && (
                <div className="syllabus-topics">
                  {unit.topics.map((topic, ti) => (
                    <label key={ti} className={`syllabus-topic ${topic.done ? 'done' : ''}`}>
                      <input
                        type="checkbox"
                        checked={topic.done}
                        onChange={() => onToggleTopic(ui, ti)}
                        className="syllabus-checkbox"
                      />
                      <span className="syllabus-topic-name">{topic.name}</span>
                      {topic.done && <span className="syllabus-done-badge">✓</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SyllabusTracker;
