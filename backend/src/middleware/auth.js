import jwt from 'jsonwebtoken';
export function authenticate(req,res,next){ const token=req.cookies?.token || req.headers.authorization?.replace('Bearer ',''); if(!token) return res.status(401).json({message:'Authentication required'}); try{req.user=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return res.status(401).json({message:'Invalid session'})} }
export function adminOnly(req,res,next){ if(!['admin','owner'].includes(req.user?.role)) return res.status(403).json({message:'Admin access required'}); next(); }
export function ownerOnly(req,res,next){ if(req.user?.role!=='owner') return res.status(403).json({message:'Owner access required'}); next(); }
