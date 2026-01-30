import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, ShoppingCart, ChevronDown, ChevronUp, Package, Droplets, Target, Utensils, Flame, Settings } from 'lucide-react';
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
    stallFactor: 0.65,
    defaultTargetTemp: 203,
    spritz: { recommended: true, startAfter: 120, interval: 60, type: "Apple Cider Vinegar" }
  },
  porkButt: {
    label: "Pork Shoulder / Butt",
    defaultWeight: 8,
    tempProfiles: {
      225: { rate: 1.5 },
      250: { rate: 1.1 }, 
      275: { rate: 1.0 },
    },
    rest: { default: 45, min: 30, maxHold: 300 },
    stallFactor: 0.60,
    defaultTargetTemp: 205,
    spritz: { recommended: true, startAfter: 120, interval: 60, type: "Apple Juice/Vinegar" }
  },
  ribs: {
    label: "Pork Ribs (Spare/Baby Back)",
    defaultWeight: 3,
    tempProfiles: {
      225: { rate: 2.0 },
      250: { rate: 1.75 },
      275: { rate: 1.5 },
    },
    rest: { default: 15, min: 10, maxHold: 60 },
    stallFactor: 0.50,
    defaultTargetTemp: 200, 
    spritz: { recommended: true, startAfter: 90, interval: 45, type: "Apple Cider Vinegar" }
  },
  turkey: {
    label: "Turkey (Whole)",
    defaultWeight: 12,
    tempProfiles: {
      225: { rate: 0.75 }, 
      250: { rate: 0.5 },
      275: { rate: 0.35 }, 
      300: { rate: 0.30 }, 
      325: { rate: 0.25 }
    },
    rest: { default: 30, min: 20, maxHold: 90 },
    stallFactor: 0.80, 
    defaultTargetTemp: 165,
    spritz: { recommended: false, startAfter: 60, interval: 45, type: "Melted Butter" }
  },
   chicken: {
    label: "Chicken (Whole)",
    defaultWeight: 5,
    tempProfiles: {
      225: { rate: 0.8 }, 
      250: { rate: 0.6 },
      275: { rate: 0.5 }, 
      325: { rate: 0.35 }
    },
    rest: { default: 15, min: 10, maxHold: 45 },
    stallFactor: 0.85,
    defaultTargetTemp: 165,
    spritz: { recommended: false, startAfter: 45, interval: 45, type: "Melted Butter/Oil" }
  }
};

const WRAP_STRATEGIES = {
  foil_pan: { label: "Foil Pan Covered (Braise)", multiplier: 0.95, desc: "Fastest. Steams meat. Soft bark." },
  foil: { label: "Alum Foil (Tight Wrap)", multiplier: 1.0, desc: "Fast. Standard method." },
  paper: { label: "Butcher Paper", multiplier: 1.08, desc: "Good bark. Breathable." },
  none: { label: "No Wrap (Naked)", multiplier: 1.25, desc: "Max bark. Long stall." },
};

const AFFILIATE_PRODUCTS = {
  instant: [
    { id: 1, title: "Instant Read Thermometer", link: "#", why: "Safety first. Verify 165°F." },
    { id: 2, title: "Heat Resistant Gloves", link: "#", why: "Handle hot pans/birds safely." }
  ],
  planning: [
    { id: 3, title: "Pink Butcher Paper", link: "#", why: "Preserve that bark (breathable wrap)." },
    { id: 4, title: "Deep Aluminum Pans", link: "#", why: "Essential for boat method or catching drippings." },
    { id: 5, title: "Poultry Shears", link: "#", why: "For spatchcocking the bird easily." }
  ]
};

export default function PelletPlanner() {
  const [inputs, setInputs] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pelletPlanV6');
      if (saved) return JSON.parse(saved);
    }
    return {
      meatType: 'porkButt',
      weight: 8,
      temp: 250,
      restTime: 45,
      serveTime: '',
      prepTime: 45,
      wrapStrategy: 'foil_pan', 
      wrapTemp: 165,
      targetTemp: 205,
      spritzEnabled: true,
      spritzStart: 120,
      spritzInterval: 60,
      isSpatchcock: false, 
      fatSideUp: false,    
    };
  });

  const [plan, setPlan] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [showSettings, setShowSettings] = useState(false); 

  useEffect(() => {
    localStorage.setItem('pelletPlanV6', JSON.stringify(inputs));
  }, [inputs]);

  const handleMeatChange = (type) => {
    const profile = MEAT_PROFILES[type];
    const isPoultry = type === 'turkey' || type === 'chicken';
    
    setInputs(prev => ({
      ...prev,
      meatType: type,
      weight: profile.defaultWeight,
      restTime: profile.rest.default,
      wrapStrategy: isPoultry ? 'none' : 'foil_pan', 
      wrapTemp: 165,
      targetTemp: profile.defaultTargetTemp,
      
      // Smart Defaults (but user can override later)
      spritzEnabled: isPoultry ? true : profile.spritz.recommended, 
      spritzStart: profile.spritz.startAfter,
      spritzInterval: profile.spritz.interval,
      
      isSpatchcock: false,
      fatSideUp: false,
      temp: type === 'turkey' ? 275 : 250 
    }));
  };

  // --- LOGIC ENGINE ---
  useEffect(() => {
    if (!inputs.serveTime || !inputs.weight) return;

    const profile = MEAT_PROFILES[inputs.meatType];
    const isPoultry = inputs.meatType === 'turkey' || inputs.meatType === 'chicken';
    
    // 1. Base Rate
    let rate = 1.0;
    if (profile.tempProfiles[inputs.temp]) {
        rate = profile.tempProfiles[inputs.temp].rate;
    } else {
        rate = 1.0; // Fallback
    }

    const wrapMod = WRAP_STRATEGIES[inputs.wrapStrategy].multiplier;
    
    // 2. Cook Duration Calc
    let baseCookHours = inputs.weight * rate;
    
    // Spatchcock Modifier
    if (inputs.isSpatchcock && isPoultry) {
        baseCookHours = baseCookHours * 0.75; 
    }
    
    // Wrap Modifier
    let adjustedCookHours = baseCookHours * wrapMod;

    // 3. Spritz Tax
    let spritzCount = 0;
    if (inputs.spritzEnabled) {
        const estDurationMins = adjustedCookHours * 60;
        const spritzWindowMins = estDurationMins - inputs.spritzStart;
        if (spritzWindowMins > 0) {
            spritzCount = Math.floor(spritzWindowMins / inputs.spritzInterval);
        }
    }
    const spritzPenaltyHours = (spritzCount * 15) / 60; 
    adjustedCookHours += spritzPenaltyHours;

    // 4. Buffer (Always 15% for Pellet Variability)
    const bufferHours = adjustedCookHours * 0.15; 
    const totalCookMinutes = (adjustedCookHours + bufferHours) * 60;
    
    const serveDate = parseISO(inputs.serveTime);
    if (!isValid(serveDate)) return;

    // 5. Timeline Generation (Backwards)
    const finishCookTime = subMinutes(serveDate, inputs.restTime);
    const startCookTime = subMinutes(finishCookTime, totalCookMinutes);
    const startPrepTime = subMinutes(startCookTime, inputs.prepTime);
    
    // Wrap Milestone Calculation
    let wrapTimingFactor = profile.stallFactor;
    if (inputs.wrapStrategy !== 'none') {
        // Adjust wrap timing based on user's custom Wrap Temp
        const tempDiff = inputs.wrapTemp - 160;
        if (tempDiff > 0) wrapTimingFactor += (tempDiff * 0.005); 
    }
    const minutesUntilWrap = totalCookMinutes * wrapTimingFactor;
    const wrapTime = addMinutes(startCookTime, minutesUntilWrap);

    // Spritz Window Calculation
    let spritzStartTime = null;
    let spritzEndTime = null;
    if (inputs.spritzEnabled && spritzCount > 0) {
        spritzStartTime = addMinutes(startCookTime, inputs.spritzStart);
        // Stop spritzing when wrapped
        spritzEndTime = inputs.wrapStrategy !== 'none' ? wrapTime : subMinutes(finishCookTime, 60);
    }

    // --- WARNINGS ---
    const newWarnings = [];
    
    // Turkey Safety
    if (inputs.meatType === 'turkey' && inputs.weight > 14 && inputs.temp < 275 && !inputs.isSpatchcock) {
        newWarnings.push({
            type: 'safety',
            msg: `⛔ SAFETY ALERT: Large turkeys (>14lb) at ${inputs.temp}°F are unsafe. Increase temp to 275°F+ or use "Spatchcock" mode.`
        });
    }

    // Poultry Skin
    if (isPoultry && inputs.wrapStrategy === 'none' && inputs.temp < 275) {
         newWarnings.push({
            type: 'quality',
            msg: `⚠️ Rubber Skin Alert: Poultry skin needs 275°F+ to crisp. Your current temp is low.`
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
        spritzWindow: spritzStartTime ? { start: spritzStartTime, end: spritzEndTime, count: spritzCount, type: profile.spritz.type } : null,
        totalCookHours: (totalCookMinutes / 60).toFixed(1),
        affiliateMode,
        isPoultry
    });

    setWarnings(newWarnings);

  }, [inputs]);

  const formatTime = (date) => format(date, 'h:mm a');
  
  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen p-4 font-sans text-gray-800">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">🔥 Pellet Planner</h1>
        <p className="text-sm text-gray-500">Master Recipe Mode (V6)</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <div className="space-y-4">
          
          {/* Main Inputs */}
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Meat</label>
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
                <option value={225}>225° Low/Slow</option>
                <option value={250}>250° Standard</option>
                <option value={275}>275° Turbo</option>
                {(inputs.meatType === 'turkey' || inputs.meatType === 'chicken') && (
                     <>
                     <option value={300}>300° Roast</option>
                     <option value={325}>325° Crisp Skin</option>
                     </>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Serve Time</label>
            <input 
              type="datetime-local" 
              className="w-full p-3 bg-orange-50 border border-orange-200 text-orange-900 rounded-lg text-lg font-bold focus:ring-2 focus:ring-orange-500 outline-none"
              value={inputs.serveTime}
              onChange={(e) => setInputs({...inputs, serveTime: e.target.value})}
            />
          </div>

          {/* RECIPE SETTINGS (Expanded) */}
          <div className="pt-4 border-t border-gray-100">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center w-full justify-between text-sm font-bold text-gray-700 hover:text-orange-600 py-2"
            >
              <span className="flex items-center"><Settings size={16} className="mr-2 text-orange-500"/> Recipe Settings</span>
              {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {showSettings && (
              <div className="space-y-4 pt-3 animate-slide-up">
                 
                 {/* Technique Toggles */}
                 <div className="grid grid-cols-2 gap-3">
                    {/* Poultry Toggle */}
                    {(inputs.meatType === 'turkey' || inputs.meatType === 'chicken') && (
                         <div className="flex items-center justify-between bg-blue-50 p-2 rounded border border-blue-100">
                            <label className="text-xs text-blue-900 font-semibold flex items-center">
                                <Utensils size={12} className="mr-1"/> Spatchcock?
                            </label>
                            <input 
                                type="checkbox" 
                                checked={inputs.isSpatchcock}
                                onChange={(e) => setInputs({...inputs, isSpatchcock: e.target.checked})}
                                className="h-4 w-4"
                            />
                         </div>
                     )}
                     {/* Brisket Toggle */}
                     {inputs.meatType === 'brisket' && (
                         <div className="flex items-center justify-between bg-blue-50 p-2 rounded border border-blue-100">
                            <label className="text-xs text-blue-900 font-semibold flex items-center">
                                <Flame size={12} className="mr-1"/> Fat Side Up?
                            </label>
                            <input 
                                type="checkbox" 
                                checked={inputs.fatSideUp}
                                onChange={(e) => setInputs({...inputs, fatSideUp: e.target.checked})}
                                className="h-4 w-4"
                            />
                         </div>
                     )}
                 </div>

                 {/* Wrap Settings */}
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-gray-700 uppercase flex items-center">
                            <Package size={14} className="mr-2 text-orange-500"/> Wrap
                        </label>
                        {inputs.wrapStrategy !== 'none' && (
                            <div className="flex items-center">
                                <span className="text-[10px] text-gray-500 mr-2">Temp:</span>
                                <input 
                                    type="number" 
                                    className="w-12 p-1 text-center bg-white border rounded text-xs"
                                    value={inputs.wrapTemp}
                                    onChange={(e) => setInputs({...inputs, wrapTemp: parseInt(e.target.value)})}
                                />
                                <span className="text-[10px] text-gray-400 ml-1">°F</span>
                            </div>
                        )}
                    </div>
                    <select 
                        className="w-full p-2 bg-white border rounded text-sm"
                        value={inputs.wrapStrategy}
                        onChange={(e) => setInputs({...inputs, wrapStrategy: e.target.value})}
                    >
                        {Object.entries(WRAP_STRATEGIES).map(([key, data]) => (
                            <option key={key} value={key}>{data.label}</option>
                        ))}
                    </select>
                 </div>

                 {/* Baste/Spritz Settings (Fully Toggleable) */}
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-gray-700 uppercase flex items-center">
                             <Droplets size={14} className="mr-2 text-blue-500"/> 
                             {plan?.isPoultry ? "Butter Baste" : "Spritz / Baste"}
                        </label>
                        <input 
                            type="checkbox" 
                            checked={inputs.spritzEnabled}
                            onChange={(e) => setInputs({...inputs, spritzEnabled: e.target.checked})}
                            className="h-4 w-4 text-blue-600 rounded"
                        />
                    </div>
                    {inputs.spritzEnabled && (
                        <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="block text-[10px] text-gray-500 mb-1">Start (mins)</label>
                                <input 
                                    type="number" 
                                    className="w-full p-1.5 bg-white border rounded text-xs"
                                    value={inputs.spritzStart}
                                    onChange={(e) => setInputs({...inputs, spritzStart: parseInt(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-1">Interval (mins)</label>
                                <input 
                                    type="number" 
                                    className="w-full p-1.5 bg-white border rounded text-xs"
                                    value={inputs.spritzInterval}
                                    onChange={(e) => setInputs({...inputs, spritzInterval: parseInt(e.target.value)})}
                                />
                            </div>
                        </div>
                    )}
                 </div>

                 {/* Finish Temps & Prep */}
                 <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Target °F</label>
                        <input 
                            type="number" 
                            className="w-full p-1.5 bg-white border rounded text-xs"
                            value={inputs.targetTemp}
                            onChange={(e) => setInputs({...inputs, targetTemp: parseInt(e.target.value)})}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Rest (min)</label>
                        <input 
                            type="number" 
                            className="w-full p-1.5 bg-white border rounded text-xs"
                            value={inputs.restTime}
                            onChange={(e) => setInputs({...inputs, restTime: parseInt(e.target.value)})}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Prep (min)</label>
                        <input 
                            type="number" 
                            className="w-full p-1.5 bg-white border rounded text-xs"
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
            <div key={i} className={`border-l-4 p-4 mb-6 rounded-r flex ${w.type === 'safety' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-400'}`}>
                <AlertTriangle className={`h-5 w-5 ${w.type === 'safety' ? 'text-red-500' : 'text-yellow-400'}`} />
                <div className="ml-3">
                  <p className={`text-sm ${w.type === 'safety' ? 'text-red-700 font-bold' : 'text-yellow-700'}`}>{w.msg}</p>
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
              <p className="text-sm text-gray-500">Trim, season, ignite grill. 
              {inputs.isSpatchcock && " Butterfly (Spatchcock) the bird."}
              </p>
            </div>

            {/* 2. Cook Start */}
            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-gray-800 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.startCook)}</p>
              <h4 className="font-bold text-gray-800">Meat on Grate</h4>
              <p className="text-sm text-gray-500">
                {inputs.meatType === 'brisket' && inputs.fatSideUp ? "Fat Side UP. " : "Fat Side DOWN. "}
                Close the lid.
              </p>
            </div>

            {/* 3. Spritz / Baste Phase */}
            {plan.spritzWindow && (
                <div className="relative pl-6">
                    <div className="absolute -left-[9px] bg-blue-300 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
                    <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                        <div className="flex justify-between items-start">
                             <div>
                                <h4 className="font-bold text-blue-900 text-sm flex items-center">
                                    <Droplets size={12} className="mr-1"/> {plan.isPoultry ? "Baste Phase" : "Spritz Phase"}
                                </h4>
                                <p className="text-xs text-blue-700 mt-1">
                                    Start: <b>{formatTime(plan.spritzWindow.start)}</b><br/>
                                    Use: {plan.spritzWindow.type}<br/>
                                    Repeat every {inputs.spritzInterval} mins (~{plan.spritzWindow.count} times).
                                </p>
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. The Wrap */}
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
                    <p className="text-sm text-gray-500">
                        {inputs.meatType === 'ribs' ? "Add butter/sugar/honey (optional)." : `Wrap in ${WRAP_STRATEGIES[inputs.wrapStrategy].label}.`}
                    </p>
                </div>
            ) : (
                <div className="relative pl-6">
                    <div className="absolute -left-[9px] bg-gray-300 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
                    <p className="text-xs text-gray-400 font-mono">~{formatTime(plan.wrapTime)}</p>
                    <h4 className="font-semibold text-gray-600">The Stall</h4>
                    <p className="text-sm text-gray-500">Temp will stick around 160°F. Be patient.</p>
                </div>
            )}

            {/* 5. Finish */}
            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-green-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.finishCook)}</p>
              <h4 className="font-bold text-gray-800">Target Finish</h4>
              <p className="text-sm text-gray-500">
                {inputs.meatType === 'ribs' ? (
                    "Check Visuals: Bend test or bones sticking out."
                ) : (
                    <>Target Internal Temp: <b>{inputs.targetTemp}°F</b> (Probe Tender).</>
                )}
              </p>
            </div>

            {/* 6. Serve */}
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
