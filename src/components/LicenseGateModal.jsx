import React, { useState } from 'react';
import {
  ShieldCheck,
  Key,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  Lock,
  Phone,
  User,
  Calendar,
  X
} from 'lucide-react';
import { api } from '../services/api';

export const LicenseGateModal = ({
  isOpen,
  isBlocking = false,
  licenseInfo,
  onClose,
  onLicenseUpdated
}) => {
  const [mobileInput, setMobileInput] = useState(licenseInfo?.mobile || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedHwid, setCopiedHwid] = useState(false);

  if (!isOpen) return null;

  const handleCopyHwid = () => {
    if (licenseInfo?.machineId) {
      navigator.clipboard.writeText(licenseInfo.machineId);
      setCopiedHwid(true);
      setTimeout(() => setCopiedHwid(false), 2000);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    const cleanMobile = mobileInput.replace(/\D/g, '');
    if (!cleanMobile || cleanMobile.length < 8) {
      setErrorMessage('Please enter a valid mobile number with country code (e.g. 917838981942).');
      return;
    }

    setIsVerifying(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await api.activateLicense(cleanMobile);
      if (res.valid) {
        setSuccessMessage(res.message || 'License activated and bound to this PC successfully!');
        setTimeout(() => {
          if (onLicenseUpdated) onLicenseUpdated();
          if (onClose) onClose();
        }, 1200);
      } else {
        setErrorMessage(res.error || 'License verification rejected. Please verify your subscription.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Could not connect to verification server. Please check internet.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRefresh = async () => {
    setIsVerifying(true);
    setErrorMessage('');
    try {
      const res = await api.verifyLicense();
      if (res.valid) {
        setSuccessMessage('License successfully synced with server!');
        if (onLicenseUpdated) onLicenseUpdated();
        setTimeout(() => setSuccessMessage(''), 2500);
      } else {
        setErrorMessage(res.error || 'License is no longer active.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Could not connect to verification server.');
    } finally {
      setIsVerifying(false);
    }
  };

  const isValid = licenseInfo?.isValid;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close button only if not blocking */}
        {!isBlocking && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Modal Header */}
        <div className="flex items-start gap-4">
          <div
            className={`p-3.5 rounded-2xl shrink-0 ${
              isValid
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-purple-500/10 border border-purple-500/30 text-purple-400'
            }`}
          >
            {isValid ? <ShieldCheck className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>{isValid ? 'License Active & Verified' : 'Software License Activation'}</span>
              {isValid && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  PRO
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isValid
                ? 'Your device is authenticated and authorized for autonomous WhatsApp automation.'
                : 'Enter your registered mobile number to activate this software and bind your device.'}
            </p>
          </div>
        </div>

        {/* Device Machine ID Badge */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Cpu className="w-4 h-4 text-slate-500" />
            <span>Machine ID:</span>
            <span className="font-mono text-slate-200 text-[11px] truncate max-w-[200px]">
              {licenseInfo?.machineId || 'Detecting...'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyHwid}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium flex items-center gap-1 transition"
            title="Copy hardware ID"
          >
            <Copy className="w-3 h-3" />
            <span>{copiedHwid ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        {/* Valid License Info Cards */}
        {isValid && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                  <User className="w-3 h-3" /> Licensee
                </span>
                <p className="font-semibold text-slate-200 truncate">{licenseInfo.name || 'Customer'}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-slate-500 flex items-center gap-1 text-[11px]">
                  <Phone className="w-3 h-3" /> Registered Phone
                </span>
                <p className="font-semibold text-slate-200 font-mono">+{licenseInfo.mobile}</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-[11px] text-slate-400">Valid Until:</span>
                  <p className="font-semibold text-slate-200">{licenseInfo.validTill || 'Lifetime'}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400">Days Remaining:</span>
                <p className="text-sm font-bold text-emerald-400 font-mono">
                  {licenseInfo.daysLeft !== undefined ? `${licenseInfo.daysLeft} Days` : 'Active'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-medium flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form when activating or re-activating */}
        {!isValid ? (
          <form onSubmit={handleActivate} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Registered Mobile Number (with country code):
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  placeholder="e.g. 917838981942"
                  value={mobileInput}
                  onChange={(e) => setMobileInput(e.target.value)}
                  disabled={isVerifying}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Your mobile number must match the number registered in your subscription plan.
              </p>
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying License with Server...</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Activate & Unlock Software</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isVerifying}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Sync License</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LicenseGateModal;
