import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  autoConnect: true,
  auth: (cb) => {
    cb({ token: localStorage.getItem('token') });
  }
});

export default socket;
