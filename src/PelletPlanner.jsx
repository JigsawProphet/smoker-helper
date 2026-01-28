import React, { useState, useEffect } from 'react';
import { Clock, Thermometer, AlertTriangle, ShoppingCart, ChevronDown, ChevronUp, Package, Flame } from 'lucide-react';
import { addMinutes, subMinutes, format, differenceInHours, parseISO, isValid } from 'date-fns';

// --- CONFIGURATION & DATA ---

const MEAT_PROFILES = {
  brisket: {
    label: "Brisket (Full Packer)",
    defaultWeight: 12,
    tempProfiles: {
      225: { rate: 1.5 },
      250: { rate: 1.25 },
      275: { rate: 1.0 },
    },
    rest: { default: 120, min: 60, maxHold: 300 },
    stallFactor: 0.65, // Base stall point (approx 160F)
  },
  porkButt: {
    label: "Pork Shoulder / Butt",
    defaultWeight: 8,
    tempProfiles: {
      225: { rate: 1.5 },
      250: { rate: 1.2 }, // Meat Church: ~1hr/lb at 250 (roughly matches)
      275: { rate: 1.0 },
    },
    rest: { default: 45, min: 30, maxHold: 300 },
    stallFactor: 0.60,
  },
  ribs: {
    label: "Pork Ribs (3-2-1 style)",
    defaultWeight: 3,
    tempProfiles: {
      225: { rate: 2.0 },
      250: { rate: 1.75 },
      275: { rate: 1.5 },
    },
    rest: { default: 15, min: 10, maxHold: 60 },
    stallFactor: 0.50, // Wrap happens earlier for ribs (3-2-1 method)
  },
  turkey: {
    label: "Turkey Breast (Boneless)",
    defaultWeight: 4,
    tempProfiles: {
      225: { rate: 0.75 },
      250: { rate: 0.5 },
      275: { rate: 0.4 },
    },
    rest: { default: 20, min: 15, maxHold: 60 },
    stallFactor: 0.80, // Turkey doesn't stall hard, usually no wrap needed
  }
};

const WRAP_STRATEGIES = {
  foil: { label: "Foil / Pan Cover", multiplier: 1.0, desc: "Fastest. Soft bark." },
  paper: { label: "Butcher Paper", multiplier: 1.08, desc: "Good bark. Breathable." },
  none: { label: "No Wrap (Naked)", multiplier: 1.25, desc: "Max bark. Long stall." },
};

const AFFILIATE_PRODUCTS = {
  instant: [
    { id: 1, title: "Instant Read Thermometer", link: "#", why: "Don't wrap by time, wrap by temp." },
    { id: 2, title: "Heat Resistant Gloves", link: "#", why: "Essential for handling hot meat." }
  ],
  planning: [
    { id: 3, title: "Pink Butcher Paper", link: "#", why: "Preserve that bark (breathable wrap)." },
    { id: 4, title: "Heavy Duty Foil (Extra Wide)", link: "#", why: "Best for 'Boat' or Pan wrapping." },
    { id: 5, title: "Faux Cambro Cooler", link: "#", why: "Hold meat safely for 4+ hours." }
  ]
};

export default function PelletPlanner() {
  // 1. STATE MANAGEMENT
  const [inputs, setInputs] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pelletPlanV2');
      if (saved) return JSON.parse(saved);
    }
    return {
      meatType: 'porkButt',
      weight: 8,
      temp: 250,
      restTime: 45,
      serveTime: '',
      prepTime: 45,
      wrapStrategy: 'foil', // New default
      wrapTemp: 165,        // New default
    };
  });

  const [plan, setPlan] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 2. PERSISTENCE
  useEffect(() => {
    localStorage.setItem('pelletPlanV2', JSON.stringify(inputs));
  }, [inputs]);

  // 3. SMART DEFAULTS
  const handleMeatChange = (type) => {
    const profile = MEAT_PROFILES[type];
    setInputs(prev => ({
      ...prev,
      meatType: type,
      weight: profile.defaultWeight,
      restTime: profile.rest.default,
      // Reset wrap to standard if they switch meats
      wrapStrategy: type === 'turkey' ? 'none' : 'foil',
      wrapTemp: 165
    }));
  };

  // 4. CALCULATION ENGINE
  useEffect(() => {
    if (!inputs.serveTime || !inputs.weight) return;

    const profile = MEAT_PROFILES[inputs.meatType];
    const rate = profile.tempProfiles[inputs.temp].rate;
    const wrapMod = WRAP_STRATEGIES[inputs.wrapStrategy].multiplier;
    
    // Core Math
    // 1. Base Cook (Assuming standard foil wrap)
    let baseCookHours = inputs.weight * rate;
    
    // 2. Apply Wrap Strategy Multiplier (Paper is slower, Naked is much slower)
    let adjustedCookHours = baseCookHours * wrapMod;

    // 3. Add Buffer (15% for variability)
    const bufferHours = adjustedCookHours * 0.15; 
    const totalCookMinutes = (adjustedCookHours + bufferHours) * 60;
    
    const serveDate = parseISO(inputs.serveTime);
    if (!isValid(serveDate)) return;

    // Backward Calculation
    const finishCookTime = subMinutes(serveDate, inputs.restTime);
    const startCookTime = subMinutes(finishCookTime, totalCookMinutes);
    const startPrepTime = subMinutes(startCookTime, inputs.prepTime);
    
    // Wrap Time Calculation
    // The "Stall Factor" in config assumes ~160F. 
    // If user pushes Wrap Temp to 175F, the "Wrap Action" happens later.
    // Roughly: Every 10 degrees above 160 adds ~5-8% to the pre-wrap duration.
    let wrapTimingFactor = profile.stallFactor;
    if (inputs.wrapStrategy !== 'none') {
        const tempDiff = inputs.wrapTemp - 160;
        if (tempDiff > 0) {
             // Push the wrap time back slightly if they want higher internal temp
             wrapTimingFactor += (tempDiff * 0.005); 
        }
    }
    
    const minutesUntilWrap = totalCookMinutes * wrapTimingFactor;
    const wrapTime = addMinutes(startCookTime, minutesUntilWrap);

    // Warnings
    const newWarnings = [];
    if (inputs.restTime > profile.rest.maxHold) {
      newWarnings.push({
        type: 'quality',
        msg: `⚠️ Long Rest Warning: ${profile.label} may dry out if held > ${(profile.rest.maxHold/60).toFixed(1)}h without active heat.`
      });
    }
    if (inputs.wrapStrategy === 'none' && inputs.meatType !== 'turkey') {
         newWarnings.push({
        type: 'timing',
        msg: `⚠️ No-Wrap Strategy: The "Stall" is unpredictable. Plan for extra time (20%+ added).`
      });
    }
    
    const hoursUntilServe = differenceInHours(serveDate, new Date());
    const affiliateMode = hoursUntilServe < 24 ? 'instant' : 'planning';

    setPlan({
      startPrep: startPrepTime,
      startCook: startCookTime,
      wrapTime: wrapTime,
      finishCook: finishCookTime,
      serve: serveDate,
      totalCookHours: (totalCookMinutes / 60).toFixed(1),
      affiliateMode
    });

    setWarnings(newWarnings);

  }, [inputs]);

  const formatTime = (date) => format(date, 'h:mm a');
  
  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen p-4 font-sans text-gray-800">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">🔥 Pellet Planner</h1>
        <p className="text-sm text-gray-500">Don't guess. Eat on time.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <div className="space-y-4">
          
          {/* Main Inputs */}
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">What are we smoking?</label>
            <select 
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-lg focus:ring-2 focus:ring-orange-500 outline-none"
              value={inputs.meatType}
              onChange={(e) => handleMeatChange(e.target.value)}
            >
              {Object.entries(MEAT_PROFILES).map(([key, data]) => (
                <option key={key} value={key}>{data.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Weight (lbs)</label>
              <input 
                type="number" 
                step="0.5"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-lg font-mono focus:ring-2 focus:ring-orange-500 outline-none"
                value={inputs.weight}
                onChange={(e) => setInputs({...inputs, weight: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Set Temp (°F)</label>
              <select 
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-lg font-mono focus:ring-2 focus:ring-orange-500 outline-none"
                value={inputs.temp}
                onChange={(e) => setInputs({...inputs, temp: parseInt(e.target.value)})}
              >
                <option value={225}>225° Low</option>
                <option value={250}>250° Std</option>
                <option value={275}>275° Hot</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">When do we eat?</label>
            <input 
              type="datetime-local" 
              className="w-full p-3 bg-orange-50 border border-orange-200 text-orange-900 rounded-lg text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none"
              value={inputs.serveTime}
              onChange={(e) => setInputs({...inputs, serveTime: e.target.value})}
            />
          </div>

          {/* Advanced / Wrap Toggle */}
          <div className="pt-2 border-t border-gray-100">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center w-full justify-between text-xs font-bold text-gray-500 hover:text-orange-600 py-2"
            >
              <span>ADVANCED (WRAP & REST)</span>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {showAdvanced && (
              <div className="space-y-4 pt-2 animate-fade-in">
                 
                 {/* Wrap Strategy */}
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center mb-2">
                        <Package size={14} className="mr-2 text-orange-500"/>
                        <label className="text-xs font-bold text-gray-700 uppercase">Wrap Strategy</label>
                    </div>
                    <select 
                        className="w-full p-2 bg-white border rounded mb-2 text-sm"
                        value={inputs.wrapStrategy}
                        onChange={(e) => setInputs({...inputs, wrapStrategy: e.target.value})}
                    >
                        {Object.entries(WRAP_STRATEGIES).map(([key, data]) => (
                            <option key={key} value={key}>{data.label}</option>
                        ))}
                    </select>
                    
                    {inputs.wrapStrategy !== 'none' && (
                        <div className="flex items-center justify-between mt-2">
                            <label className="text-xs text-gray-500">Wrap at Internal Temp:</label>
                            <div className="flex items-center">
                                <input 
                                    type="number" 
                                    className="w-16 p-1 text-center bg-white border rounded text-sm font-mono"
                                    value={inputs.wrapTemp}
                                    onChange={(e) => setInputs({...inputs, wrapTemp: parseInt(e.target.value)})}
                                />
                                <span className="text-xs text-gray-400 ml-1">°F</span>
                            </div>
                        </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1 italic">{WRAP_STRATEGIES[inputs.wrapStrategy].desc}</p>
                 </div>

                 {/* Rest & Prep */}
                 <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Rest (mins)</label>
                        <input 
                            type="number" 
                            className="w-full p-2 bg-white border rounded text-sm"
                            value={inputs.restTime}
                            onChange={(e) => setInputs({...inputs, restTime: parseInt(e.target.value)})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Prep Buffer (mins)</label>
                        <input 
                            type="number" 
                            className="w-full p-2 bg-white border rounded text-sm"
                            value={inputs.prepTime}
                            onChange={(e) => setInputs({...inputs, prepTime: parseInt(e.target.value)})}
                        />
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {plan ? (
        <div className="animate-slide-up">
          
          {warnings.map((w, i) => (
            <div key={i} className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">{w.msg}</p>
                </div>
              </div>
            </div>
          ))}

          {/* HERO */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-blue-900 text-white p-4 rounded-xl shadow-lg text-center">
              <p className="text-xs uppercase opacity-70 mb-1">Wake Up / Prep</p>
              <p className="text-2xl font-bold">{formatTime(plan.startPrep)}</p>
            </div>
            <div className="bg-green-600 text-white p-4 rounded-xl shadow-lg text-center">
              <p className="text-xs uppercase opacity-70 mb-1">Meat on Grate</p>
              <p className="text-2xl font-bold">{formatTime(plan.startCook)}</p>
            </div>
          </div>

          {/* TIMELINE */}
          <div className="relative border-l-2 border-gray-200 ml-4 space-y-8 pb-8">
            
            {/* 1. Prep */}
            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-blue-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.startPrep)}</p>
              <h4 className="font-bold text-gray-800">Start Prep</h4>
              <p className="text-sm text-gray-500">Trim, season, ignite grill.</p>
            </div>

            {/* 2. Cook Start */}
            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-gray-800 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.startCook)}</p>
              <h4 className="font-bold text-gray-800">Meat on Grate</h4>
              <p className="text-sm text-gray-500">Close the lid. Don't look.</p>
            </div>

            {/* 3. The Wrap (Dynamic) */}
            {inputs.wrapStrategy !== 'none' ? (
                <div className="relative pl-6">
                    <div className="absolute -left-[9px] bg-orange-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
                    <p className="text-xs text-gray-400 font-mono">~{formatTime(plan.wrapTime)}</p>
                    <div className="flex items-center gap-2">
                        <h4 className="font-bold text-orange-700">Action: Wrap Meat</h4>
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">
                            {inputs.wrapTemp}°F
                        </span>
                    </div>
                    <p className="text-sm text-gray-500">Bark is set. Wrap in {WRAP_STRATEGIES[inputs.wrapStrategy].label}.</p>
                </div>
            ) : (
                <div className="relative pl-6">
                    <div className="absolute -left-[9px] bg-gray-300 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
                    <p className="text-xs text-gray-400 font-mono">~{formatTime(plan.wrapTime)}</p>
                    <h4 className="font-semibold text-gray-600">The Stall</h4>
                    <p className="text-sm text-gray-500">Temp will stick around 160°F. Be patient.</p>
                </div>
            )}

            {/* 4. Finish */}
            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-green-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.finishCook)}</p>
              <h4 className="font-bold text-gray-800">Target Finish (Probe Tender)</h4>
              <p className="text-sm text-gray-500">Internal temp ~203°F. Probe slides like butter.</p>
            </div>

            {/* 5. Serve */}
            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-red-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.serve)}</p>
              <h4 className="font-bold text-gray-800">Serve Time</h4>
              <p className="text-sm text-gray-500">After a {inputs.restTime}m rest.</p>
            </div>
          </div>

          {/* AFFILIATE */}
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase mb-3 flex items-center">
              <ShoppingCart size={14} className="mr-2"/> 
              {plan.affiliateMode === 'instant' ? "Quick Fixes" : "Pro Gear for This Cook"}
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {AFFILIATE_PRODUCTS[plan.affiliateMode].map(item => (
                <a key={item.id} href={item.link} className="flex items-center p-3 bg-white border border-gray-200 rounded-lg hover:border-orange-300 transition-colors group">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-blue-600 group-hover:underline">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.why}</p>
                  </div>
                </a>
              ))}
            </div>
            <p className="text-[10px] text-gray-300 mt-2 text-center">As an Amazon Associate I earn from qualifying purchases.</p>
          </div>

        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>Enter a serve time to generate your plan.</p>
        </div>
      )}
    </div>
  );
}
