export function iterate<T>(obj: T, filter: (value: any) => boolean = () => true) {
    var walked = [];
    var stack: { obj: any; stack: string }[] = [{ obj: obj, stack: "" }];
    let members = [];
    while (stack.length > 0) {
        var item = <any>stack.pop();
        var obj = <T>item.obj;
        for (var property in obj) {
            if (obj.hasOwnProperty(property)) {
                if (typeof obj[property] == "object") {
                    var alreadyFound = false;
                    for (var i = 0; i < walked.length; i++) {
                        if (walked[i] === obj[property]) {
                            alreadyFound = true;
                            break;
                        }
                    }
                    if (!alreadyFound) {
                        walked.push(obj[property]);
                        stack.push({
                            obj: <any>obj[property],
                            stack: item.stack + "." + property,
                        });
                    }
                } else {
                    if (filter(obj[property])) {
                        members.push(item.stack + "." + property);
                    }
                }
            }
        }
    }
    return members;
}

export function toCamelCase(str: string) {
    return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, function(word: string, index: number) {
            return index == 0 ? word.toLowerCase() : word.toUpperCase();
        })
        .replace(/\s+/g, "");
}

export function filterEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
}

export function areSameStringIgnoringCase(stringA: string, stringB: string): boolean {
    if (stringA === null && stringB === null) {
        return true;
    }
    if (stringA === null && stringB != null) {
        return false;
    }
    return (
        stringA.localeCompare(stringB, undefined, {
            sensitivity: "accent",
        }) === 0
    );
}
