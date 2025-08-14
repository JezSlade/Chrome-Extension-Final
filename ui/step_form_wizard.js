class StepFormWizardModal {
  constructor(options = {}) {
    // Default configuration
    this.config = {
      containerId: options.containerId || 'wizardModal',
      steps: options.steps || [],
      showProgressBar: options.showProgressBar !== false,
      showStepNumbers: options.showStepNumbers !== false,
      allowStepSkipping: options.allowStepSkipping || false,
      validateOnNext: options.validateOnNext !== false,
      closeOnBackdrop: options.closeOnBackdrop !== false,
      closeOnEscape: options.closeOnEscape !== false,
      animation: options.animation !== false,
      theme: options.theme || 'default',
      ...options
    };

    // Internal state
    this.state = {
      currentStep: 0,
      totalSteps: this.config.steps.length,
      visitedSteps: new Set([0]),
      formData: {},
      stepValidation: {}
    };

    // Create modal container if not exists
    if (!document.getElementById(this.config.containerId)) {
      this.container = document.createElement('div');
      this.container.id = this.config.containerId;
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById(this.config.containerId);
    }

    // Build modal HTML
    this.container.innerHTML = this.getModalHTML();
    this.modal = this.container.querySelector('.wizard-modal');
    
    // Hide initially
    this.container.style.display = 'none';
  }

  getModalHTML() {
    return `
      <div class="wizard-backdrop">
        <div class="wizard-modal">
          <div class="wizard-header">
            <h3 class="wizard-title">${this.config.title || 'Step Wizard'}</h3>
            <button class="wizard-close" type="button">&times;</button>
          </div>
          
          ${this.getProgressBarHTML()}
          
          <div class="wizard-body">
            <div class="wizard-steps-container">
              ${this.getStepsHTML()}
            </div>
          </div>
          
          <div class="wizard-footer">
            <div class="wizard-navigation">
              <button class="wizard-btn wizard-btn-secondary wizard-prev" type="button" disabled>
                Previous
              </button>
              <button class="wizard-btn wizard-btn-primary wizard-next" type="button">
                Next
              </button>
              <button class="wizard-btn wizard-btn-success wizard-complete" type="button" style="display: none;">
                Complete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getProgressBarHTML() {
    const steps = this.config.steps;
    let progressHTML = '<div class="wizard-progress">';
    
    if (this.config.showStepNumbers) {
      progressHTML += '<div class="wizard-step-indicators">';
      steps.forEach((step, index) => {
        progressHTML += `
          <div class="wizard-step-indicator ${index === 0 ? 'active' : ''}" data-step="${index}">
            <div class="step-number">${index + 1}</div>
            <div class="step-title">${step.title}</div>
          </div>
        `;
      });
      progressHTML += '</div>';
    }
    
    if (this.config.showProgressBar) {
      progressHTML += `
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%;"></div>
        </div>
      `;
    }
    
    progressHTML += '</div>';
    return progressHTML;
  }

  getStepsHTML() {
    return this.config.steps.map((step, index) => `
      <div class="wizard-step ${index === 0 ? 'active' : ''}" data-step="${index}">
        <div class="step-content">
          ${step.content || ''}
        </div>
      </div>
    `).join('');
  }

  bindEvents() {
    const backdrop = this.container.querySelector('.wizard-backdrop');
    const closeBtn = this.container.querySelector('.wizard-close');
    const prevBtn = this.container.querySelector('.wizard-prev');
    const nextBtn = this.container.querySelector('.wizard-next');
    const completeBtn = this.container.querySelector('.wizard-complete');
    const stepIndicators = this.container.querySelectorAll('.wizard-step-indicator');

    // Close on backdrop
    if (this.config.closeOnBackdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.close();
      });
    }

    closeBtn.addEventListener('click', () => this.close());

    // Navigation events
    prevBtn.addEventListener('click', () => this.previousStep());
    nextBtn.addEventListener('click', () => this.nextStep());
    completeBtn.addEventListener('click', () => this.complete());

    // Step indicator clicks (if step skipping allowed)
    if (this.config.allowStepSkipping) {
      stepIndicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => this.goToStep(index));
      });
    }

    // Keyboard events
    if (this.config.closeOnEscape) {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    }
  }

  // Public API
  open(initialData = {}) {
    this.setFormData(initialData);
    this.applyTheme();
    this.bindEvents();
    this.container.style.display = 'block';
    this.container.classList.remove('wizard-fade-out');
    this.container.classList.add('wizard-fade-in');
    this.updateNavigation();
    this.updateProgress();
    return this;
  }

  close() {
    this.container.classList.remove('wizard-fade-in');
    this.container.classList.add('wizard-fade-out');
    setTimeout(() => {
      this.container.style.display = 'none';
    }, 200);
    return this;
  }

  nextStep() {
    if (!this.validateCurrentStep()) return this;
    if (this.state.currentStep < this.state.totalSteps - 1) {
      this.state.currentStep++;
      this.state.visitedSteps.add(this.state.currentStep);
      this.updateStepDisplay();
      this.updateNavigation();
      this.updateProgress();
    }
    return this;
  }

  previousStep() {
    if (this.state.currentStep > 0) {
      this.state.currentStep--;
      this.updateStepDisplay();
      this.updateNavigation();
      this.updateProgress();
    }
    return this;
  }

  goToStep(index) {
    if (!this.config.allowStepSkipping) return this;
    if (index >= 0 && index < this.state.totalSteps) {
      this.state.currentStep = index;
      this.state.visitedSteps.add(index);
      this.updateStepDisplay();
      this.updateNavigation();
      this.updateProgress();
    }
    return this;
  }

  complete() {
    if (!this.validateCurrentStep()) return this;
    this.collectFormData();
    if (typeof this.config.onComplete === 'function') {
      this.config.onComplete(this.state.formData);
    }
    this.close();
    return this;
  }

  // Step rendering helpers
  updateStepDisplay() {
    const steps = this.container.querySelectorAll('.wizard-step');
    steps.forEach((step, index) => {
      step.classList.toggle('active', index === this.state.currentStep);
    });

    const indicators = this.container.querySelectorAll('.wizard-step-indicator');
    indicators.forEach((indicator, index) => {
      indicator.classList.toggle('active', index === this.state.currentStep);
      indicator.classList.toggle('completed', index < this.state.currentStep);
    });
  }

  updateNavigation() {
    const prevBtn = this.container.querySelector('.wizard-prev');
    const nextBtn = this.container.querySelector('.wizard-next');
    const completeBtn = this.container.querySelector('.wizard-complete');

    prevBtn.disabled = this.state.currentStep === 0;
    nextBtn.style.display = this.state.currentStep === this.state.totalSteps - 1 ? 'none' : 'inline-block';
    completeBtn.style.display = this.state.currentStep === this.state.totalSteps - 1 ? 'inline-block' : 'none';
  }

  updateProgress() {
    const progressFill = this.container.querySelector('.progress-fill');
    if (progressFill) {
      const progress = ((this.state.currentStep) / (this.state.totalSteps - 1)) * 100;
      progressFill.style.width = `${progress}%`;
    }
  }

  // Validation
  validateCurrentStep() {
    const index = this.state.currentStep;
    if (this.config.validateOnNext && typeof this.config.onValidate === 'function') {
      const currentStepEl = this.container.querySelector(`.wizard-step[data-step="${index}"]`);
      const ok = this.config.onValidate(index, this.getStepFormData(index), this.state.formData);
      currentStepEl.classList.toggle('validation-error', !ok);
      return !!ok;
    }
    return true;
  }

  getStepFormData(index) {
    const stepEl = this.container.querySelector(`.wizard-step[data-step="${index}"]`);
    const inputs = stepEl.querySelectorAll('input, select, textarea');
    const data = {};
    inputs.forEach(input => {
      if (input.type === 'checkbox') {
        data[input.name || input.id] = input.checked;
      } else if (input.type === 'radio') {
        if (input.checked) data[input.name] = input.value;
      } else if (input.multiple) {
        data[input.name || input.id] = Array.from(input.selectedOptions).map(o => o.value);
      } else {
        data[input.name || input.id] = input.value;
      }
    });
    return data;
  }

  collectFormData() {
    const steps = this.container.querySelectorAll('.wizard-step');
    steps.forEach((step) => {
      const inputs = step.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        if (input.type === 'checkbox') {
          this.state.formData[input.name || input.id] = input.checked;
        } else if (input.type === 'radio') {
          if (input.checked) this.state.formData[input.name] = input.value;
        } else if (input.multiple) {
          this.state.formData[input.name || input.id] = Array.from(input.selectedOptions).map(o => o.value);
        } else {
          this.state.formData[input.name || input.id] = input.value;
        }
      });
    });
  }

  setStepContent(stepIndex, content) {
    if (stepIndex >= 0 && stepIndex < this.config.steps.length) {
      this.config.steps[stepIndex].content = content;
      const stepElement = this.container.querySelector(`[data-step="${stepIndex}"] .step-content`);
      if (stepElement) {
        stepElement.innerHTML = content;
      }
    }
    return this;
  }

  getFormData() {
    this.collectFormData();
    return { ...this.state.formData };
  }

  setFormData(data) {
    this.state.formData = { ...this.state.formData, ...data };
    this.populateFormFields();
    return this;
  }

  populateFormFields() {
    Object.keys(this.state.formData).forEach(key => {
      const field = this.container.querySelector(`[name="${key}"], #${key}`);
      if (field) {
        if (field.type === 'checkbox') {
          field.checked = !!this.state.formData[key];
        } else if (field.multiple && Array.isArray(this.state.formData[key])) {
          const values = new Set(this.state.formData[key]);
          Array.from(field.options).forEach(opt => { opt.selected = values.has(opt.value); });
        } else {
          field.value = this.state.formData[key];
        }
      }
    });
  }

  on(eventName, handler) {
    if (eventName === 'complete') this.config.onComplete = handler;
    if (eventName === 'validate') this.config.onValidate = handler;
    if (eventName === 'change') this.config.onStepChange = handler;
    return this;
  }

  applyTheme() {
    // Inject CSS styles
    if (!document.getElementById('wizard-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'wizard-modal-styles';
      style.textContent = this.getCSS();
      document.head.appendChild(style);
    }
  }

  getCSS() {
    /* Opaque modal surface using your theme tokens with safe fallbacks */
    return `
      .wizard-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }

      .wizard-modal {
        width: min(920px, 96vw);
        max-height: 90vh;
        overflow: auto;
        /* Force opaque surface: prefer your solid control surface token */
        background: var(--select-bg, #ffffff);
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.35);
        color: var(--fg, #111827);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        animation: fadeIn 0.2s ease;
      }

      .wizard-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border, #e9ecef);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--select-bg, #ffffff);
      }

      .wizard-title {
        margin: 0;
        color: var(--fg, #333);
        font-size: 1.25rem;
      }

      .wizard-close {
        background: none;
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 10px;
        font-size: 1.25rem;
        cursor: pointer;
        color: var(--fg, #555);
        padding: 2px 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .wizard-close:hover { border-color: var(--accent, #2f7bff); }

      .wizard-progress {
        padding: 16px 20px;
        background: var(--select-bg, #ffffff);
        border-bottom: 1px solid var(--border, #e9ecef);
      }

      .wizard-step-indicators {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 8px;
      }

      .wizard-step-indicator {
        text-align: center;
        flex: 1;
        cursor: pointer;
        transition: all 0.3s ease;
        color: var(--muted, #6c757d);
      }

      .wizard-step-indicator .step-number {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--select-bg, #e9ecef);
        color: var(--select-fg, #111827);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 5px;
        font-weight: 700;
        border: 1px solid var(--select-border, #c7d2fe);
        transition: all 0.3s ease;
      }

      .wizard-step-indicator.active .step-number {
        background: var(--accent, #2f7bff);
        color: #fff;
        border-color: transparent;
      }

      .wizard-step-indicator.completed .step-number {
        background: var(--accent-strong, #145dff);
        color: #fff;
        border-color: transparent;
      }

      .wizard-step-indicator .step-title {
        font-size: 0.9rem;
        color: var(--fg, #495057);
      }

      .progress-bar {
        height: 4px;
        background: var(--border, #e9ecef);
        border-radius: 2px;
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        background: var(--accent, #2f7bff);
        width: 0%;
        transition: width 0.3s ease;
      }

      .wizard-body {
        padding: 20px;
        background: var(--select-bg, #ffffff);
      }

      .wizard-step { display: none; }
      .wizard-step.active { display: block; animation: fadeIn 0.3s ease; }
      .wizard-step.validation-error { animation: shake 0.5s ease; }

      .wizard-footer {
        padding: 16px 20px;
        border-top: 1px solid var(--border, #e9ecef);
        background: var(--select-bg, #ffffff);
      }

      .wizard-navigation { display: flex; justify-content: space-between; gap: 10px; }

      .wizard-btn {
        padding: 10px 14px;
        border-radius: 12px;
        cursor: pointer;
        border: 1px solid var(--border, #e5e7eb);
        background: rgba(31,39,72,0.07);
        color: var(--fg, #111827);
        transition: background 0.2s ease, border-color 0.2s ease;
      }
      .wizard-btn:disabled { opacity: 0.6; cursor: not-allowed; }

      .wizard-btn-primary {
        background: var(--accent-strong, #2f7bff);
        border-color: transparent;
        color: #fff;
      }
      .wizard-btn-primary:hover:not(:disabled) { filter: brightness(0.95); }

      .wizard-btn-secondary {
        background: transparent;
        color: var(--fg, #111827);
      }
      .wizard-btn-secondary:hover:not(:disabled) { border-color: var(--accent, #2f7bff); }

      .wizard-btn-success {
        background: var(--accent, #2f7bff);
        border-color: transparent;
        color: #fff;
      }
      .wizard-btn-success:hover { filter: brightness(0.95); }

      .wizard-fade-in { animation: fadeIn 0.2s ease; }
      .wizard-fade-out { animation: fadeOut 0.2s ease; }

      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(8px); } }
      @keyframes shake {
        10%, 90% { transform: translateX(-1px); }
        20%, 80% { transform: translateX(2px); }
        30%, 50%, 70% { transform: translateX(-4px); }
        40%, 60% { transform: translateX(4px); }
      }

      /* Uniform form controls inside wizard */
      .wizard-modal .step-content select,
      .wizard-modal .step-content input[type="text"],
      .wizard-modal .step-content input[type="url"],
      .wizard-modal .step-content input[type="email"],
      .wizard-modal .step-content input[type="number"],
      .wizard-modal .step-content input[type="color"],
      .wizard-modal .step-content textarea {
        display: block;
        width: 100%;
        min-height: 38px;
        padding: 10px 12px;
        border: 1px solid var(--select-border, #c7d2fe);
        border-radius: 12px;
        background: var(--select-bg, #ffffff);
        color: var(--select-fg, #111827);
        box-sizing: border-box;
      }
      .wizard-modal .step-content select:focus,
      .wizard-modal .step-content input:focus,
      .wizard-modal .step-content textarea:focus {
        outline: none;
        border-color: var(--accent, #2f7bff);
        box-shadow: 0 0 0 3px var(--focus-ring, rgba(47,123,255,0.35));
      }

      .wizard-modal .step-content { position: relative; z-index: 1; }
    `;
  }
}

window.StepFormWizardModal = StepFormWizardModal;
