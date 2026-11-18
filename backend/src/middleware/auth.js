import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
export async function authenticate(req,res,next){
  const token=req.cookies?.token || req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({message:'Authentication required'});
  try{
    const payload=jwt.verify(token,process.env.JWT_SECRET);
    if(typeof payload.sub==='string'){
      const result=await query('SELECT id,name,email,role,phone FROM users WHERE public_id=$1',[payload.sub]);
      if(!result.rowCount) return res.status(401).json({message:'Invalid session'});
      req.user={...payload,...result.rows[0]};
    }else{
      req.user=payload;
    }
    next();
  }catch(error){
    if(error instanceof jwt.JsonWebTokenError){
      return res.status(401).json({message:'Invalid session'});
    }
    return next(error);
  }
}
export function adminOnly(req,res,next){ if(!['admin','owner'].includes(req.user?.role)) return res.status(403).json({message:'Admin access required'}); next(); }
export function ownerOnly(req,res,next){ if(req.user?.role!=='owner') return res.status(403).json({message:'Owner access required'}); next(); }
