import { createContext, useContext } from "react";

export const ClosuresContext = createContext([]);
export const useClosures = () => useContext(ClosuresContext);
