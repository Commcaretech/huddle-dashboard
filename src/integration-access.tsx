import { createContext,useContext,useState,type ReactNode } from 'react';

const IntegrationAccess=createContext({key:'',setKey:(_key:string)=>{}});
export function IntegrationAccessProvider({children}:{children:ReactNode}) {
  const [key,setKey]=useState('');
  return <IntegrationAccess.Provider value={{key,setKey}}>{children}</IntegrationAccess.Provider>;
}
export function useIntegrationAccess() { return useContext(IntegrationAccess); }
