import { useContext, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import TaskCard from "../components/TaskCard";
import { AuthContext } from "../context/AuthProvider";
import Cookies from "universal-cookie";
import { subscribeToTaskUpdates } from "../js/socket.js";
import { messaging, requestPermission, onMessageListener } from "../firebase";
import { onMessage } from "firebase/messaging";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

const cookies = new Cookies();

// Column definitions for the Kanban board
const columns = {
  "Not Started": {
    id: "not-started",
    title: "Not Started",
    color: "blue"
  },
  "In Process": {
    id: "in-process",
    title: "In Process",
    color: "yellow"
  },
  "Completed": {
    id: "completed",
    title: "Completed",
    color: "green"
  }
};

export default function Home() {
  const [user, setUser] = useState({});
  const [tasks, setTasks] = useState([]);
  const [notStartedTasks, setNotStartedTasks] = useState([]);
  const [inProcessTasks, setInProcessTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);

  const { isRefresh, setIsRefresh } = useContext(AuthContext);
  const navigate = useNavigate();

  const BASE_URL = import.meta.env.VITE_BASE_URL;
  
  // Handle drag end event
  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    
    // If dropped outside a droppable area or same column
    if (!destination || source.droppableId === destination.droppableId) {
      return;
    }
    
    // Determine new status based on destination column
    let newStatus;
    if (destination.droppableId === "not-started") {
      newStatus = "Not Started";
    } else if (destination.droppableId === "in-process") {
      newStatus = "In Process";
    } else if (destination.droppableId === "completed") {
      newStatus = "Completed";
    }
    
    // Update task status in backend
    try {
      const token = localStorage.getItem("token");
      
      await axios.patch(
        `${BASE_URL}/tasks/status/${draggableId}`,
        { status: newStatus },
        {
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      // Update local state
      setTasks(prevTasks => {
        return prevTasks.map(task => {
          if (task._id === draggableId) {
            return { ...task, status: newStatus };
          }
          return task;
        });
      });
      
      // Re-filter tasks by status
      updateTaskLists();
      
      toast.success(`Task moved to ${newStatus}`);
    } catch (error) {
      if (error.response) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.message);
      }
    }
  };
  
  const updateTaskLists = () => {
    setNotStartedTasks(tasks.filter(task => task.status === "Not Started"));
    setInProcessTasks(tasks.filter(task => task.status === "In Process"));
    setCompletedTasks(tasks.filter(task => task.status === "Completed"));
  };

  useEffect(() => {
    const token = localStorage.getItem("token") || cookies.get("token");

    if (!token) {
      navigate("/signin");
      return;
    }

    const setupNotifications = async () => {
      const fcmToken = await requestPermission();
      if (fcmToken) {
        // Send fcmToken to your backend
        try {
          await axios.patch(
            `${BASE_URL}/users/updateFcmToken`,
            { fcmToken },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );
          console.log("FCM token updated successfully");
        } catch (error) {
          console.error("Error updating FCM token:", error);
        }
      }
    };

    setupNotifications();

    // Fetch tasks when component mounts
    const fetchTasks = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/tasks/getTasks`, {
          withCredentials: true,
          headers: {
            Authorization: "Bearer " + token,
          },
        });
        const tasks = response.data.data;

        const categoryOrder = { high: 1, medium: 2, low: 3 };

        const sortedTasks = tasks.sort((a, b) => {
          return categoryOrder[a.category] - categoryOrder[b.category];
        });

        setTasks(sortedTasks);
        
        // Filter tasks by status
        setNotStartedTasks(sortedTasks.filter(task => task.status === "Not Started"));
        setInProcessTasks(sortedTasks.filter(task => task.status === "In Process"));
        setCompletedTasks(sortedTasks.filter(task => task.status === "Completed"));
      } catch (error) {
        if (error.response) {
          toast.error(error.response.data.message);
        } else {
          toast.error(error.message);
        }
      }
    };

    const fetchUser = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/users/getUser`, {
          withCredentials: true,
          headers: {
            Authorization: "Bearer " + token,
          },
        });

        setUser(response.data.data);
      } catch (error) {
        if (error.response) {
          toast.error(error.response.data.message);
        } else {
          toast.error(error.message);
        }
      }
    };

    fetchUser();
    fetchTasks();

    // Subscribe to real-time updates
    subscribeToTaskUpdates((updatedTask) => {
      setTasks((prevTasks) => {
        const newTasks = prevTasks.map((task) => 
          (task._id === updatedTask._id ? updatedTask : task)
        );
        
        // Update task lists
        setNotStartedTasks(newTasks.filter(task => task.status === "Not Started"));
        setInProcessTasks(newTasks.filter(task => task.status === "In Process"));
        setCompletedTasks(newTasks.filter(task => task.status === "Completed"));
        
        return newTasks;
      });
      toast.info("Task updated in real-time!");
    });

    // Handle foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("Received foreground message:", payload);
      toast.info(payload.notification.title, {
        body: payload.notification.body,
      });
      // Optionally, you can update the tasks list here
      fetchTasks();
    });

    return () => {
      if (unsubscribe && typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [BASE_URL, navigate, isRefresh]);

  const sendTestNotification = async () => {
    const token = localStorage.getItem("token") || cookies.get("token");
    try {
      const response = await axios.post(
        `${BASE_URL}/users/sendTestNotification`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      console.log("Test notification sent", response.data);
    } catch (error) {
      console.error("Error sending test notification:", error.response?.data || error.message);
      if (error.response?.data?.details) {
        console.error("Detailed error:", error.response.data.details);
      }
    }
  };

  const renderColumnTasks = (columnId, tasks) => {
    return (
      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-3 min-h-[300px] transition-colors ${
              snapshot.isDraggingOver ? "bg-gray-100" : ""
            }`}
          >
            {tasks.length > 0 ? (
              tasks.map((task, index) => (
                <Draggable key={task._id} draggableId={task._id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`transition-transform ${snapshot.isDragging ? "rotate-1 scale-105" : ""}`}
                    >
                      <TaskCard task={task} user={user} />
                    </div>
                  )}
                </Draggable>
              ))
            ) : (
              <p className="text-center p-4 text-gray-500">No tasks</p>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    );
  };

  return (
    <div className="bg-red-200 min-h-screen">
      <div className="container mx-auto">
        <div className="pt-28 pb-10">
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-gray-800">
              Welcome {user?.name}
            </h1>
            <p className="mt-2 text-gray-600">Drag tasks between columns to update their status</p>
          </div>
          
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Not Started Column */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-blue-100 p-3 border-b border-blue-200">
                  <h2 className="text-xl font-semibold text-center text-blue-800">Not Started</h2>
                </div>
                <div className="p-4">
                  {renderColumnTasks("not-started", notStartedTasks)}
                </div>
              </div>
              
              {/* In Process Column */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-yellow-100 p-3 border-b border-yellow-200">
                  <h2 className="text-xl font-semibold text-center text-yellow-800">In Process</h2>
                </div>
                <div className="p-4">
                  {renderColumnTasks("in-process", inProcessTasks)}
                </div>
              </div>
              
              {/* Completed Column */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-green-100 p-3 border-b border-green-200">
                  <h2 className="text-xl font-semibold text-center text-green-800">Completed</h2>
                </div>
                <div className="p-4">
                  {renderColumnTasks("completed", completedTasks)}
                </div>
              </div>
            </div>
          </DragDropContext>
          
          <div className="mt-8 text-center">
            <button 
              onClick={sendTestNotification}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
            >
              Send Test Notification
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
