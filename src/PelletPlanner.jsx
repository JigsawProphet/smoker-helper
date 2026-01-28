import React, { useState, useEffect } from 'react';
import { Clock, Thermometer, AlertTriangle, ShoppingCart, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { addMinutes, subMinutes, format, differenceInHours, parseISO, isValid } from 'date-fns';

// --- CONFIGURATION & DATA ---
// ... (Keep the MEAT_PROFILES and AFFILIATE_PRODUCTS objects exactly as they were) ...

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
  },
  porkButt: {
    label: "Pork Shoulder / Butt",
    defaultWeight: 8,
    tempProfiles: {
      225: { rate: 1.5 },
      250: { rate: 1.2 },
      275: { rate: 1.0 },
    },
    rest: { default: 45, min: 30, maxHold: 300 },
    stallFactor: 0.60,
  },
  ribs: {
    label: "Pork Ribs (3-2-1 or sim)",
    defaultWeight: 3,
    tempProfiles: {
      225: { rate: 2.0 },
      250: { rate: 1.75 },
      275: { rate: 1.5 },
    },
    rest: { default: 15, min: 10, maxHold: 60 },
    stallFactor: 0.50,
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
    stallFactor: 0.80,
  }
};

const AFFILIATE_PRODUCTS = {
  instant: [
    { id: 1, title: "Meat Temp Magnet Guide", link: "#", why: "Don't guess internal temps." },
    { id: 2, title: "Same-Day Instant Read", link: "#", why: "Verify probe tenderness." }
  ],
  planning: [
    { id: 3, title: "Pink Butcher Paper", link: "#", why: "Power through the stall." },
    { id: 4, title: "Faux Cambro Cooler", link: "#", why: "Hold meat safely for 4+ hours." }
  ]
};

export default function PelletPlanner() {
  const [inputs, setInputs] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pelletPlanV1');
      if (saved) return JSON.parse(saved);
    }
    return {
      meatType: 'porkButt',
      weight: 8,
      temp: 250,
      restTime: 45,
      serveTime: '',
      prepTime: 45,
    };
  });

  const [plan, setPlan] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    localStorage.setItem('pelletPlanV1', JSON.stringify(inputs));
  }, [inputs]);

  const handleMeatChange = (type) => {
    const profile = MEAT_PROFILES[type];
    setInputs(prev => ({
      ...prev,
      meatType: type,
      weight: profile.defaultWeight,
      restTime: profile.rest.default
    }));
  };

  useEffect(() => {
    if (!inputs.serveTime || !inputs.weight) return;

    const profile = MEAT_PROFILES[inputs.meatType];
    const rate = profile.tempProfiles[inputs.temp].rate;
    
    const baseCookHours = inputs.weight * rate;
    const bufferHours = baseCookHours * 0.15; 
    const totalCookMinutes = (baseCookHours + bufferHours) * 60;
    
    const serveDate = parseISO(inputs.serveTime);
    if (!isValid(serveDate)) return;

    const finishCookTime = subMinutes(serveDate, inputs.restTime);
    const startCookTime = subMinutes(finishCookTime, totalCookMinutes);
    const startPrepTime = subMinutes(startCookTime, inputs.prepTime);
    
    const stallMinutes = totalCookMinutes * profile.stallFactor;
    const stallTime = addMinutes(startCookTime, stallMinutes);

    const newWarnings = [];
    if (inputs.restTime > profile.rest.maxHold) {
      newWarnings.push({
        type: 'quality',
        msg: `⚠️ Long Rest Warning: ${profile.label} may dry out if held > ${(profile.rest.maxHold/60).toFixed(1)}h without active heat.`
      });
    }
    
    const hoursUntilServe = differenceInHours(serveDate, new Date());
    const affiliateMode = hoursUntilServe < 24 ? 'instant' : 'planning';

    setPlan({
      startPrep: startPrepTime,
      startCook: startCookTime,
      stallStart: stallTime,
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

          <div className="pt-2">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-xs text-gray-400 hover:text-gray-600"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span className="ml-1">Adjust Prep & Rest</span>
            </button>
            
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-gray-50 rounded-lg animate-fade-in">
                 <div>
                  <label className="block text-xs text-gray-500 mb-1">Rest (mins)</label>
                  <input 
                    type="number" 
                    className="w-full p-2 bg-white border rounded"
                    value={inputs.restTime}
                    onChange={(e) => setInputs({...inputs, restTime: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prep Buffer (mins)</label>
                  <input 
                    type="number" 
                    className="w-full p-2 bg-white border rounded"
                    value={inputs.prepTime}
                    onChange={(e) => setInputs({...inputs, prepTime: parseInt(e.target.value)})}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {plan ? (
        <div className="animate-slide-up"> 
          {/* Note: I replaced the old arbitrarily complex class with the cleaner 'animate-slide-up' defined in CSS */}
          
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

          <div className="relative border-l-2 border-gray-200 ml-4 space-y-8 pb-8">
            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-blue-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.startPrep)}</p>
              <h4 className="font-bold text-gray-800">Start Prep</h4>
              <p className="text-sm text-gray-500">Trim, season, ignite grill.</p>
            </div>

            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-gray-800 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.startCook)}</p>
              <h4 className="font-bold text-gray-800">Meat on Grate</h4>
              <p className="text-sm text-gray-500">Close the lid. Don't look.</p>
            </div>

            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-gray-300 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">~{formatTime(plan.stallStart)}</p>
              <h4 className="font-semibold text-gray-600">The Stall</h4>
              <p className="text-sm text-gray-500">Temp will stick. Don't panic.</p>
            </div>

            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-orange-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.finishCook)}</p>
              <h4 className="font-bold text-gray-800">Target Finish (Probe Tender)</h4>
              <p className="text-sm text-gray-500">Pull when probe slides like butter.</p>
            </div>

            <div className="relative pl-6">
              <div className="absolute -left-[9px] bg-green-500 h-4 w-4 rounded-full border-4 border-white shadow-sm"></div>
              <p className="text-xs text-gray-400 font-mono">{formatTime(plan.serve)}</p>
              <h4 className="font-bold text-gray-800">Serve Time</h4>
              <p className="text-sm text-gray-500">After a {inputs.restTime}m rest.</p>
            </div>
          </div>

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
