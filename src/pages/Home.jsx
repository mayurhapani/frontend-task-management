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
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const cookies = new Cookies();

// Static column definitions to ensure consistent IDs
const COLUMNS = {
  NOT_STARTED: {
    id: "notStarted",
    title: "Not Started",
    status: "Not Started",
    className: "bg-blue-100 border-blue-200 text-blue-800"
  },
  IN_PROCESS: {
    id: "inProcess",
    title: "In Process",
    status: "In Process",
    className: "bg-yellow-100 border-yellow-200 text-yellow-800"
  },
  COMPLETED: {
    id: "completed",
    title: "Completed",
    status: "Completed",
    className: "bg-green-100 border-green-200 text-green-800"
  }
};

export default function Home() {
  const [user, setUser] = useState({});
  const [allTasks, setAllTasks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notStartedTasks, setNotStartedTasks] = useState([]);
  const [inProcessTasks, setInProcessTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const { isRefresh, setIsRefresh } = useContext(AuthContext);
  const navigate = useNavigate();

  const BASE_URL = import.meta.env.VITE_BASE_URL;
  
  // Handle drag end event
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    
    // Drop was cancelled or dropped in the same column
    if (!destination || source.droppableId === destination.droppableId) {
      return;
    }
    
    // Find the destination column to get the new status
    let newStatus = "";
    Object.values(COLUMNS).forEach(column => {
      if (column.id === destination.droppableId) {
        newStatus = column.status;
      }
    });
    
    if (!newStatus) return;
    
    // Update task status in backend
    const token = localStorage.getItem("token");
    
    axios.patch(
      `${BASE_URL}/tasks/status/${draggableId}`,
      { status: newStatus },
      {
        withCredentials: true,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
    .then(() => {
      // Update local state
      const updatedTasks = allTasks.map(task => {
        if (task._id === draggableId) {
          return { ...task, status: newStatus };
        }
        return task;
      });
      
      setAllTasks(updatedTasks);
      filterAndSortTasks(updatedTasks);
      
      toast.success(`Task moved to ${newStatus}`);
    })
    .catch(error => {
      if (error.response) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.message);
      }
    });
  };
  
  // Search function
  const handleSearch = (e) => {
    e.preventDefault();
    setIsSearching(true);
    
    const filtered = allTasks.filter(task => {
      const searchableFields = [
        task.title,
        task.description,
        task.createdBy?.name,
        task.assignTo?.name
      ];
      
      const matchesSearch = searchableFields.some(field => 
        field && field.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      const matchesDate = dateFilter 
        ? new Date(task.createdAt).toLocaleDateString() === new Date(dateFilter).toLocaleDateString()
        : true;
      
      return matchesSearch && matchesDate;
    });
    
    filterAndSortTasks(filtered);
  };
  
  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
    setDateFilter("");
    setIsSearching(false);
    filterAndSortTasks(allTasks);
  };
  
  // Filter and sort tasks
  const filterAndSortTasks = (tasksToFilter) => {
    const categoryOrder = { high: 1, medium: 2, low: 3 };
    
    const sortedTasks = [...tasksToFilter].sort((a, b) => {
      return categoryOrder[a.category] - categoryOrder[b.category];
    });
    
    setTasks(sortedTasks);
    setNotStartedTasks(sortedTasks.filter(task => task.status === "Not Started"));
    setInProcessTasks(sortedTasks.filter(task => task.status === "In Process"));
    setCompletedTasks(sortedTasks.filter(task => task.status === "Completed"));
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
          // console.log("FCM token updated successfully");
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
        const fetchedTasks = response.data.data;
        setAllTasks(fetchedTasks);
        filterAndSortTasks(fetchedTasks);
        // console.log("fetchedTasks",fetchedTasks);
        // console.log("allTasks",allTasks);
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
      setAllTasks((prevTasks) => {
        const newTasks = prevTasks.map((task) => 
          (task._id === updatedTask._id ? updatedTask : task)
        );
        
        // Update filtered tasks
        filterAndSortTasks(newTasks);
        
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

  return (
    <div className="bg-red-200 min-h-screen">
      <div className="container mx-auto">
        <div className="pt-28 md:pt-16 pb-10">
          <div className="mb-4 text-center">
            <h1 className="text-3xl font-bold text-gray-800">
              Welcome {user?.name}
            </h1>
            <p className="mt-2 text-gray-600">Drag tasks between columns to update their status</p>
          </div>
          
          {/* Search and Filter Bar */}
          <div className="mb-4 bg-white p-4 rounded-lg shadow-md">
            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
              <div className="flex-grow">
                <input
                  type="text"
                  placeholder="Search by title, description, creator or assignee..."
                  className="w-full p-2 border rounded-md"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="md:w-48">
                <input
                  type="date"
                  className="w-full p-2 border rounded-md"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Search
                </button>
                {isSearching && (
                  <button
                    type="button"
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                    onClick={clearSearch}
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>
            {isSearching && (
              <div className="mt-2 text-sm text-gray-600">
                Showing {tasks.length} filtered results
              </div>
            )}
          </div>
          
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* Not Started Column */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
                <div className={`p-3 border-b ${COLUMNS.NOT_STARTED.className}`}>
                  <h2 className="text-xl font-semibold text-center">
                    {COLUMNS.NOT_STARTED.title}
                  </h2>
                </div>
                <Droppable droppableId={COLUMNS.NOT_STARTED.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`p-4 space-y-2 overflow-y-auto h-[500px] transition-colors ${
                        snapshot.isDraggingOver ? "bg-blue-50" : ""
                      }`}
                    >
                      {notStartedTasks.length > 0 ? (
                        notStartedTasks.map((task, index) => (
                          <Draggable key={task._id} draggableId={task._id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  cursor: 'grab'
                                }}
                                className={`transition-transform ${snapshot.isDragging ? "rotate-1 scale-105 shadow-lg z-10" : ""}`}
                              >
                                <TaskCard task={task} user={user} />
                              </div>
                            )}
                          </Draggable>
                        ))
                      ) : (
                        <p className="text-center text-gray-500 p-4">No tasks</p>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
              
              {/* In Process Column */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
                <div className={`p-3 border-b ${COLUMNS.IN_PROCESS.className}`}>
                  <h2 className="text-xl font-semibold text-center">
                    {COLUMNS.IN_PROCESS.title}
                  </h2>
                </div>
                <Droppable droppableId={COLUMNS.IN_PROCESS.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`p-4 space-y-2 overflow-y-auto h-[500px] transition-colors ${
                        snapshot.isDraggingOver ? "bg-yellow-50" : ""
                      }`}
                    >
                      {inProcessTasks.length > 0 ? (
                        inProcessTasks.map((task, index) => (
                          <Draggable key={task._id} draggableId={task._id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  cursor: 'grab'
                                }}
                                className={`transition-transform ${snapshot.isDragging ? "rotate-1 scale-105 shadow-lg z-10" : ""}`}
                              >
                                <TaskCard task={task} user={user} />
                              </div>
                            )}
                          </Draggable>
                        ))
                      ) : (
                        <p className="text-center text-gray-500 p-4">No tasks</p>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
              
              {/* Completed Column */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
                <div className={`p-3 border-b ${COLUMNS.COMPLETED.className}`}>
                  <h2 className="text-xl font-semibold text-center">
                    {COLUMNS.COMPLETED.title}
                  </h2>
                </div>
                <Droppable droppableId={COLUMNS.COMPLETED.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`p-4 space-y-2 overflow-y-auto h-[500px] transition-colors ${
                        snapshot.isDraggingOver ? "bg-green-50" : ""
                      }`}
                    >
                      {completedTasks.length > 0 ? (
                        completedTasks.map((task, index) => (
                          <Draggable key={task._id} draggableId={task._id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  cursor: 'grab'
                                }}
                                className={`transition-transform ${snapshot.isDragging ? "rotate-1 scale-105 shadow-lg z-10" : ""}`}
                              >
                                <TaskCard task={task} user={user} />
                              </div>
                            )}
                          </Draggable>
                        ))
                      ) : (
                        <p className="text-center text-gray-500 p-4">No tasks</p>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          </DragDropContext>
          
          {/* <div className="mt-8 text-center">
            <button 
              onClick={sendTestNotification}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
            >
              Send Test Notification
            </button>
          </div> */}
        </div>
      </div>
    </div>
  );
}
