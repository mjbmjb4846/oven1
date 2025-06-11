// Custom chart implementation for ARM compatibility
// Replaces Chart.js with a lightweight canvas-based temperature chart

class TemperatureChart {
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.maxDataPoints = options.maxDataPoints || 30;
        this.minValue = options.minValue || 20;
        this.maxValue = options.maxValue || 320;
        
        // Light theme colors
        this.gridColor = options.gridColor || '#e0e0e0';
        this.lineColor = options.lineColor || '#2196f3';
        this.fillColor = options.fillColor || 'rgba(33, 150, 243, 0.1)';
        this.backgroundColor = options.backgroundColor || '#ffffff';
        this.textColor = options.textColor || '#333333';
        this.hoverLineColor = options.hoverLineColor || '#ff9800';
        this.currentTempLineColor = options.currentTempLineColor || '#4caf50';
        
        // Interactive state
        this.hoveredDataIndex = -1;
        this.isHovering = false;
        
        // Temperature unit state
        this.isFahrenheit = false;
        
        // Initialize with default data
        this.data = Array(this.maxDataPoints).fill(25);
        
        // Set up canvas
        this.setupCanvas();
        
        // Initial draw
        this.draw();
        
        // Handle resize
        window.addEventListener('resize', () => this.setupCanvas());
        
        // Add mouse event listeners for interactivity
        this.setupMouseEvents();
    }
    
    // Temperature conversion functions
    celsiusToFahrenheit(celsius) {
        return (celsius * 9/5) + 32;
    }
    
    fahrenheitToCelsius(fahrenheit) {
        return (fahrenheit - 32) * 5/9;
    }
    
    // Method to set temperature unit
    setTemperatureUnit(isFahrenheit) {
        this.isFahrenheit = isFahrenheit;
        this.draw(); // Redraw chart with new units
    }
    
    // Convert temperature for display based on current unit
    convertTempForDisplay(tempCelsius) {
        return this.isFahrenheit ? this.celsiusToFahrenheit(tempCelsius) : tempCelsius;
    }
    
    // Get temperature unit symbol
    getTempUnitSymbol() {
        return this.isFahrenheit ? '°F' : '°C';
    }
      setupMouseEvents() {
        // Mouse events for desktop
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        
        // Touch events for mobile/tablet
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', () => this.handleMouseLeave());
        this.canvas.addEventListener('touchcancel', () => this.handleMouseLeave());
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        // Convert touch to mouse-like coordinates
        const touch = e.touches[0];
        this.handleInteraction(touch);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        // Convert touch to mouse-like coordinates
        const touch = e.touches[0];
        this.handleInteraction(touch);
    }
    
    handleInteraction(pointerEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = pointerEvent.clientX - rect.left;
        const y = pointerEvent.clientY - rect.top;
        
        const padding = 50; // Increased padding to match drawLabels
        const chartWidth = this.width - 2 * padding;
        
        // Check if pointer is within the chart area
        if (x >= padding && x <= this.width - padding && y >= padding && y <= this.height - padding) {
            // Calculate which data point the pointer is closest to
            const relativeX = x - padding;
            const dataIndex = Math.round((relativeX / chartWidth) * (this.data.length - 1));
            
            if (dataIndex >= 0 && dataIndex < this.data.length) {
                this.hoveredDataIndex = dataIndex;
                this.isHovering = true;
                this.draw();
            }
        } else {
            this.handleMouseLeave();
        }
    }
      handleMouseMove(e) {
        this.handleInteraction(e);
    }
    
    handleMouseLeave() {
        if (this.isHovering) {
            this.isHovering = false;
            this.hoveredDataIndex = -1;
            this.draw();
        }
    }
    
    setupCanvas() {
        // Get container dimensions
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        // Set canvas size with device pixel ratio for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Scale the canvas back down using CSS
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Scale the drawing context so everything draws at the higher resolution
        this.ctx.scale(dpr, dpr);
        
        // Store actual drawing dimensions
        this.width = rect.width;
        this.height = rect.height;
        
        // Set up drawing context
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }
    
    addDataPoint(value) {
        // Remove the oldest data point and add the new one
        this.data.shift();
        this.data.push(value);
        this.draw();
    }
    
    updateData(newData) {
        this.data = [...newData];
        // Ensure we have the right number of data points
        while (this.data.length < this.maxDataPoints) {
            this.data.unshift(this.data[0] || 25);
        }
        while (this.data.length > this.maxDataPoints) {
            this.data.shift();
        }
        this.draw();
    }
    
    draw() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        
        // Clear canvas
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid
        this.drawGrid();
        
        // Draw temperature line and fill
        this.drawTemperatureLine();
        
        // Draw labels
        this.drawLabels();
    }
    
    drawGrid() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        const padding = 50; // Increased padding to prevent text clipping
        
        ctx.strokeStyle = this.gridColor;
        ctx.lineWidth = 1;
        
        // Horizontal grid lines (temperature levels)
        const tempRange = this.maxValue - this.minValue;
        const tempStep = tempRange / 6; // 6 horizontal lines
        
        for (let i = 0; i <= 6; i++) {
            const temp = this.minValue + (i * tempStep);
            const y = padding + (height - 2 * padding) * (1 - i / 6);
            
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // Vertical grid lines (time)
        const timeStep = (width - 2 * padding) / 6;
        for (let i = 0; i <= 6; i++) {
            const x = padding + (i * timeStep);
            
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, height - padding);
            ctx.stroke();
        }
    }
    
    drawTemperatureLine() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        const padding = 50; // Increased padding to match grid
        
        if (this.data.length < 2) return;
        
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;
        
        // Create path for the line
        ctx.beginPath();
        
        this.data.forEach((value, index) => {
            const x = padding + (index / (this.data.length - 1)) * chartWidth;
            const normalizedValue = (value - this.minValue) / (this.maxValue - this.minValue);
            const y = padding + chartHeight * (1 - normalizedValue);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        // Draw the fill area
        if (this.fillColor) {
            ctx.lineTo(padding + chartWidth, height - padding);
            ctx.lineTo(padding, height - padding);
            ctx.closePath();
            ctx.fillStyle = this.fillColor;
            ctx.fill();
        }
        
        // Draw the line
        ctx.beginPath();
        this.data.forEach((value, index) => {
            const x = padding + (index / (this.data.length - 1)) * chartWidth;
            const normalizedValue = (value - this.minValue) / (this.maxValue - this.minValue);
            const y = padding + chartHeight * (1 - normalizedValue);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.strokeStyle = this.lineColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw data points with hover highlighting
        this.data.forEach((value, index) => {
            const x = padding + (index / (this.data.length - 1)) * chartWidth;
            const normalizedValue = (value - this.minValue) / (this.maxValue - this.minValue);
            const y = padding + chartHeight * (1 - normalizedValue);
            
            ctx.beginPath();
            
            // Highlight hovered point
            if (this.isHovering && index === this.hoveredDataIndex) {
                ctx.fillStyle = this.hoverLineColor;
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
            } else {
                ctx.fillStyle = this.lineColor;
                ctx.arc(x, y, 2, 0, 2 * Math.PI);
            }
            ctx.fill();
        });
    }
    
    drawLabels() {
        const ctx = this.ctx;
        const width = this.width;
        const height = this.height;
        const padding = 50; // Increased padding to prevent text clipping
        
        ctx.fillStyle = this.textColor;
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        // Temperature labels (Y-axis)
        const tempRange = this.maxValue - this.minValue;
        const tempStep = tempRange / 6;
        
        for (let i = 0; i <= 6; i++) {
            const tempCelsius = this.minValue + (i * tempStep);
            const displayTemp = this.convertTempForDisplay(tempCelsius);
            const y = padding + (height - 2 * padding) * (1 - i / 6);
            
            ctx.fillText(`${Math.round(displayTemp)}${this.getTempUnitSymbol()}`, padding - 10, y);
        }
        
        // Draw temperature indicator line and label
        if (this.data.length > 0) {
            let displayTemp, lineColor, labelText;
            
            if (this.isHovering && this.hoveredDataIndex >= 0) {
                // Show hovered data point temperature
                displayTemp = this.data[this.hoveredDataIndex];
                lineColor = this.hoverLineColor;
                const timeAgo = this.data.length - 1 - this.hoveredDataIndex;
                const convertedTemp = this.convertTempForDisplay(displayTemp);
                labelText = `${Math.round(convertedTemp)}${this.getTempUnitSymbol()} (t-${timeAgo})`;
            } else {
                // Show current temperature
                displayTemp = this.data[this.data.length - 1];
                lineColor = this.currentTempLineColor;
                const convertedTemp = this.convertTempForDisplay(displayTemp);
                labelText = `${Math.round(convertedTemp)}${this.getTempUnitSymbol()} (now)`;
            }
            
            const normalizedValue = (displayTemp - this.minValue) / (this.maxValue - this.minValue);
            const y = padding + (height - 2 * padding) * (1 - normalizedValue);
            
            // Draw temperature line
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Draw temperature label with background for better readability
            ctx.font = 'bold 14px Arial';
            
            // Measure text first to determine positioning
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = 16;
            
            // Position label to the right of the chart area, but ensure it stays within canvas
            let labelX = width - padding + 10;
            
            // If the label would go outside the canvas, position it to the left of the line
            if (labelX + textWidth + 10 > width) {
                labelX = width - padding - textWidth - 15;
                ctx.textAlign = 'right';
            } else {
                ctx.textAlign = 'left';
            }
            
            const labelY = y;
            
            // Draw background rectangle
            ctx.fillStyle = this.backgroundColor;
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            
            const rectX = ctx.textAlign === 'left' ? labelX - 5 : labelX - textWidth - 5;
            ctx.fillRect(rectX, labelY - textHeight/2 - 2, textWidth + 10, textHeight + 4);
            ctx.strokeRect(rectX, labelY - textHeight/2 - 2, textWidth + 10, textHeight + 4);
            
            // Draw text
            ctx.fillStyle = lineColor;
            ctx.fillText(labelText, labelX, labelY);
        }
        
        // Title
        ctx.fillStyle = this.textColor;
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Temperature History', width / 2, 10);
    }
    
    // Method to update chart (compatible with Chart.js API)
    update() {
        this.draw();
    }
      // Destroy method for cleanup
    destroy() {
        // Remove event listeners
        this.canvas.removeEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.removeEventListener('mouseleave', () => this.handleMouseLeave());
        this.canvas.removeEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.removeEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.removeEventListener('touchend', () => this.handleMouseLeave());
        this.canvas.removeEventListener('touchcancel', () => this.handleMouseLeave());
        window.removeEventListener('resize', () => this.setupCanvas());
        // Canvas will be cleaned up by DOM
    }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemperatureChart;
}
