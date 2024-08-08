class Connection {
    id: string | undefined
    url: string | undefined
    contextId: string | undefined  
}

class Context {
    id: string | undefined
    type: string | undefined
    resourceId: string | undefined  
    displayName: string | undefined  
}
export default class ConnectionManagerMock {
    private connection : Connection ={
        id : "connection-1",
        // local would be something like url : "/Users/joshuareynolds/Documents/src/dqm-content-r4/input/tests/measure/CMS165/CMS165-patient-1"
        // I think each represents a "repository" of data, so I am thinking the fhirserver acts as a "remote repository"
        url : "http://localhost:8000",
        contextId: "context-123"
    }
    private contexts : Context[] = [{
        id: "context-123",
        type: "Patient",
        resourceId: "Patient-123",
        displayName: "Patient-123"
    }, {
        id: "context-123",
        type: "Patient",
        resourceId: "Patient-456",
        displayName: "Patient-456"
    }];

    public getCurrentConnection() : Connection {
        return this.connection
    }

    public getCurrentContexts() : Context[] {
        return this.contexts
    }
}